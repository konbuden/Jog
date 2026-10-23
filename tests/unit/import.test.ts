import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { importHealthFile } from '../../src/infrastructure/apple-health/import-file';
import { HealthParser, identifyRun } from '../../src/infrastructure/apple-health/parser';
import type { RunCandidate } from '../../src/domain/models/run';

const xml = readFileSync(new URL('../fixtures/synthetic/export.xml', import.meta.url), 'utf8');
const file = (content: string, name = 'export.xml') => new File([content], name);
async function parse(content: string) {
  const runs: RunCandidate[] = [];
  const report = await importHealthFile(file(content), async (batch) => {
    runs.push(...batch);
  });
  return { runs, report };
}

it('XMLからランニングだけを抽出し、距離・秒・bpmを正規化する', async () => {
  const { runs, report } = await parse(xml);
  expect(report.runningCount).toBe(2);
  expect(report.ignoredWorkouts).toBe(1);
  expect(runs.map((run) => run.distanceMeters)).toEqual([5000, 6000]);
  expect(runs.map((run) => run.durationSeconds)).toEqual([1800, 2160]);
  expect(runs.map((run) => run.averageHeartRateBpm)).toEqual([135, null]);
  expect(runs[0]?.startTime).toBe('2026-10-01T01:00:00.000Z');
});

it('同じXMLと単位表記が異なるXMLから同じIDを生成する', async () => {
  const first = await parse(xml),
    second = await parse(xml);
  expect(first.runs.map((run) => run.id)).toEqual(second.runs.map((run) => run.id));
  const units = await parse(
    xml.replace(
      'totalDistance="5" totalDistanceUnit="km"',
      'totalDistance="5000" totalDistanceUnit="m"',
    ),
  );
  expect(units.runs[0]?.id).toBe(first.runs[0]?.id);
});

it('ZIPのexport.xmlを展開し、他のエントリは解析しない', async () => {
  const zip = zipSync({
    'apple_health_export/export.xml': strToU8(xml),
    'routes/route.gpx': strToU8('not xml'),
  });
  const runs: RunCandidate[] = [];
  const report = await importHealthFile(new File([zip], 'export.zip'), async (batch) => {
    runs.push(...batch);
  });
  expect(report.runningCount).toBe(2);
  expect(runs).toHaveLength(2);
});

it('破損ZIP・複数XML・XMLなし・未対応ファイルを拒否する', async () => {
  const noop = async () => {};
  await expect(importHealthFile(file('invalid', 'data.zip'), noop)).rejects.toThrow('ZIP');
  await expect(importHealthFile(file('text', 'data.txt'), noop)).rejects.toThrow('ZIPまたはXML');
  for (const data of [
    { 'export.xml': strToU8(xml), 'nested/export.xml': strToU8(xml) },
    { 'readme.txt': strToU8('no export') },
  ] as Record<string, Uint8Array<ArrayBuffer>>[]) {
    await expect(importHealthFile(new File([zipSync(data)], 'data.zip'), noop)).rejects.toThrow(
      'export.xml',
    );
  }
});

it('CRCが違うZIPを拒否する', async () => {
  const zip = zipSync({ 'export.xml': strToU8(xml) });
  const view = new DataView(zip.buffer);
  for (let i = 0; i < zip.length - 46; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      zip[i + 16] = zip[i + 16]! ^ 1;
      break;
    }
  await expect(importHealthFile(new File([zip], 'data.zip'), async () => {})).rejects.toThrow(
    '整合性',
  );
});

it('不正XML・外部実体・空ファイルを拒否する', async () => {
  for (const bad of [
    '<HealthData><Workout></HealthData>',
    '<Other/>',
    '<!DOCTYPE HealthData [<!ENTITY x SYSTEM "https://example.invalid/">]><HealthData/>',
    '',
  ]) {
    await expect(parse(bad)).rejects.toThrow();
  }
});

it('欠損心拍を時刻の重なるRecordから補完しない', async () => {
  const { runs } = await parse(
    xml.replace(
      '<WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="135" unit="count/min"/>',
      '',
    ),
  );
  expect(runs.every((run) => run.averageHeartRateBpm === null)).toBe(true);
});

it('不明単位の距離・不正日付を除外し、不正な心拍はnullにする', async () => {
  expect(
    (await parse(xml.replace('totalDistanceUnit="km"', 'totalDistanceUnit="furlong"'))).report
      .excluded,
  ).toBe(1);
  expect(
    (await parse(xml.replace('2026-10-01 10:00:00', '2026-02-30 10:00:00'))).report.excluded,
  ).toBe(1);
  const heart = await parse(xml.replace('average="135"', 'average="NaN"'));
  expect(heart.runs[0]?.averageHeartRateBpm).toBeNull();
  expect(Object.keys(heart.report.warnings)).toHaveLength(1);
});

it('複数の心拍統計は統合せず、距離を二重加算しない', async () => {
  const result = await parse(
    xml.replace(
      '<WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="135" unit="count/min"/>',
      '<WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="135" unit="count/min"/><WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="139" unit="bpm"/><WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="5000" unit="m"/>',
    ),
  );
  expect(result.runs[0]?.averageHeartRateBpm).toBeNull();
  expect(result.runs[0]?.distanceMeters).toBe(5000);
});

it('チャンク境界をまたいでも解析し、キャンセルを反映する', async () => {
  const pending: Promise<RunCandidate>[] = [];
  const parser = new HealthParser((run) => pending.push(identifyRun(run)));
  for (let offset = 0; offset < xml.length; offset += 7)
    parser.write(xml.slice(offset, offset + 7));
  parser.finish();
  expect(await Promise.all(pending)).toHaveLength(2);
  await expect(
    importHealthFile(
      file(xml),
      async () => {},
      undefined,
      () => true,
    ),
  ).rejects.toThrow('キャンセル');
});

it('マイルと時間を正規化する', async () => {
  const result = await parse(
    xml
      .replace(
        'totalDistance="5" totalDistanceUnit="km"',
        'totalDistance="3" totalDistanceUnit="mi"',
      )
      .replace('duration="30" durationUnit="min"', 'duration="0.5" durationUnit="hr"'),
  );
  expect(result.runs[0]?.distanceMeters).toBeCloseTo(4828.032);
  expect(result.runs[0]?.durationSeconds).toBe(1800);
});

it('明示的UUIDは距離やdeviceの変化があっても同じIDになる', async () => {
  const withId = xml.replace(
    'sourceName="Synthetic Watch" duration="30"',
    'uuid="synthetic-uuid" sourceName="Synthetic Watch" duration="30"',
  );
  const first = await parse(withId);
  const second = await parse(
    withId
      .replace('totalDistance="5"', 'totalDistance="5.1"')
      .replace('uuid="synthetic-uuid"', 'uuid="synthetic-uuid" device="Synthetic Device"'),
  );
  expect(first.runs[0]?.id).toBe(second.runs[0]?.id);
});

it('過大なXMLトークンと容量超過を拒否する', async () => {
  await expect(parse(`<HealthData><!--${'x'.repeat(400_000)}--></HealthData>`)).rejects.toThrow(
    '要素サイズ',
  );
  const oversized = file('<HealthData/>');
  Object.defineProperty(oversized, 'size', { value: 512 * 1024 * 1024 + 1 });
  await expect(importHealthFile(oversized, async () => {})).rejects.toThrow('512 MiB');
});

it('時間欠損を開始終了差で埋めず、距離の不一致は警告する', async () => {
  expect((await parse(xml.replace('duration="30"', 'duration=""'))).report.excluded).toBe(1);
  const result = await parse(
    xml.replace(
      '<WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate"',
      '<WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="4900" unit="m"/><WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate"',
    ),
  );
  expect(result.runs[0]?.distanceMeters).toBe(5000);
  expect(Object.keys(result.report.warnings).some((key) => key.includes('差'))).toBe(true);
});
