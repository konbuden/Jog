import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { zipSync, strToU8 } from 'fflate';
import { afterEach, expect, it } from 'vitest';
import { RunningDatabase, commitStaging } from '../../src/infrastructure/db/database';
import { stageImportRuns, type ImportReceipt } from '../../src/infrastructure/db/import-records';
import { importedCounts, clearImportedData } from '../../src/infrastructure/db/delete-imported';
import { importHealthFile } from '../../src/infrastructure/apple-health/import-file';
import { syntheticRun } from '../fixtures/synthetic/run';
import { baseXml, detailedXml, gpx } from '../fixtures/synthetic/details';
import { DEFAULT_GOALS } from '../../src/domain/models/goals';
import type { RunCandidate } from '../../src/domain/models/run';
const databases: RunningDatabase[] = [];
function create() {
  const database = new RunningDatabase(crypto.randomUUID());
  databases.push(database);
  return database;
}
afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});
async function candidates(xml: string) {
  const runs: RunCandidate[] = [];
  await importHealthFile(new File([xml], 'export.xml'), async (batch) => {
    runs.push(...batch);
  });
  return runs;
}
const receipt: ImportReceipt = {
  id: 'synthetic-fingerprint',
  inputBytes: 100,
  validCount: 1,
  firstTime: '2026-10-01T01:00:00.000Z',
  lastTime: '2026-10-01T01:00:00.000Z',
  report: { runningCount: 1, excluded: 0, ignoredWorkouts: 0, warnings: {} },
  importedAt: '2026-10-31T00:00:00.000Z',
};
it('機器表記が変わると旧IDが異なることを再現し、行照合で追加を防ぐ', async () => {
  const first = (
    await candidates(
      baseXml.replaceAll(
        'sourceName="Synthetic Watch"',
        'device="Synthetic 0x111" sourceName="Synthetic Watch"',
      ),
    )
  )[0]!;
  const second = (
    await candidates(
      baseXml.replaceAll(
        'sourceName="Synthetic Watch"',
        'device="Synthetic 0x222" sourceName="Synthetic Watch"',
      ),
    )
  )[0]!;
  expect(first.id).not.toBe(second.id);
  const database = create();
  expect((await stageImportRuns(database, [first])).added).toBe(1);
  await commitStaging(database, false, receipt);
  expect(await stageImportRuns(database, [second])).toMatchObject({
    added: 0,
    duplicates: 1,
    conflicts: 0,
  });
  expect((await commitStaging(database, false)).added).toBe(0);
  expect(await database.runs.count()).toBe(1);
  expect((await database.runs.toArray())[0]?.id).toBe(first.id);
});
it('同一ファイル内と100件バッチの境界の重複を除外する', async () => {
  const database = create();
  const runs = Array.from({ length: 101 }, (_, i) =>
    syntheticRun({
      id: `run-${i}`,
      startTime: new Date(Date.UTC(2026, 0, 1) + i * 3600000).toISOString(),
      endTime: new Date(Date.UTC(2026, 0, 1) + i * 3600000 + 1800000).toISOString(),
    }),
  );
  expect((await stageImportRuns(database, runs.slice(0, 100))).added).toBe(100);
  const batch = await stageImportRuns(database, [
    { ...runs[0]!, id: 'changed-device' },
    runs[100]!,
    runs[100]!,
  ]);
  expect(batch).toMatchObject({ added: 1, duplicates: 2 });
  expect((await commitStaging(database, false)).added).toBe(101);
  expect(await database.runs.count()).toBe(101);
});
it('既存＋新規の混在では新規分だけを対象にし、詳細追加は明示時のみ行う', async () => {
  const database = create();
  const old = (await candidates(baseXml))[0]!,
    incoming = await candidates(detailedXml);
  await database.runs.add({ ...old, importedAt: '2026-10-01T00:00:00.000Z' });
  const result = await stageImportRuns(database, incoming);
  expect(result).toMatchObject({
    added: 1,
    duplicates: 1,
    firstTime: incoming[1]!.startTime,
    lastTime: incoming[1]!.startTime,
  });
  expect(result.enhanced.size).toBe(0);
  expect(result.routeTargets.has(old.id)).toBe(false);
  await commitStaging(database, false);
  expect((await database.runs.get(old.id))?.details?.totalSteps).toBeUndefined();
  const enriched = await stageImportRuns(database, incoming, true);
  expect(enriched.enhanced.size).toBe(1);
  await commitStaging(database, true);
  expect((await database.runs.get(old.id))?.details?.totalSteps).toBe(5400);
  expect(await database.runs.count()).toBe(2);
});
it('同じUUIDは表記差でも重複とし、異なるUUID/出典は統合しない', async () => {
  const database = create(),
    uuid = '12345678-1234-4567-89ab-123456789abc';
  const first = syntheticRun({ id: 'first', sourceId: `uuid:${uuid}` });
  await stageImportRuns(database, [first]);
  expect(
    (
      await stageImportRuns(database, [
        {
          ...first,
          id: 'renamed',
          sourceName: 'Renamed Watch',
          sourceId: `uuid:${uuid.toUpperCase()}`,
        },
      ])
    ).duplicates,
  ).toBe(1);
  expect(
    (
      await stageImportRuns(database, [
        { ...first, id: 'other-uuid', sourceId: 'uuid:22345678-1234-4567-89ab-123456789abc' },
      ])
    ).added,
  ).toBe(1);
  expect(
    (
      await stageImportRuns(database, [
        syntheticRun({ id: 'other-source', sourceName: 'Other Provider' }),
      ])
    ).added,
  ).toBe(1);
});
it('保存直前にも照合し、指紋履歴は確定と同時に保存する', async () => {
  const database = create(),
    first = syntheticRun();
  await database.runs.add(first);
  await database.staging.add({ ...first, id: 'different-id' });
  expect(await commitStaging(database, false, receipt)).toMatchObject({ added: 0, duplicates: 1 });
  expect(await database.runs.count()).toBe(1);
  expect(await database.imports.get(receipt.id)).toEqual(receipt);
});
it('確定失敗時はラン・指紋履歴・一時削除をすべてロールバックする', async () => {
  const database = create();
  await database.staging.add(syntheticRun());
  await expect(
    database.transaction(
      'rw',
      database.runs,
      database.staging,
      database.routes,
      database.stagingRoutes,
      database.imports,
      async () => {
        await commitStaging(database, false, receipt);
        throw new Error('synthetic failure');
      },
    ),
  ).rejects.toThrow('synthetic failure');
  expect(await database.runs.count()).toBe(0);
  expect(await database.imports.count()).toBe(0);
  expect(await database.staging.count()).toBe(1);
});
it('v3からv4へ移行しても既存IDと既存データを勝手に削除しない', async () => {
  const name = crypto.randomUUID(),
    old = new Dexie(name),
    run = syntheticRun();
  old.version(3).stores({
    runs: '&id,startTime',
    staging: '&id,startTime',
    routes: '&id',
    stagingRoutes: '&id',
    settings: '&id',
  });
  await old.table('runs').bulkAdd([run, { ...run, id: 'old-duplicate' }]);
  old.close();
  const database = new RunningDatabase(name);
  databases.push(database);
  expect(await database.runs.count()).toBe(2);
  expect((await stageImportRuns(database, [{ ...run, id: 'new-export-id' }])).duplicates).toBe(1);
  expect(await database.staging.count()).toBe(0);
});
it('全削除はラン・コース・取り込み履歴・一時データを消し、目標を保持する', async () => {
  const database = create(),
    run = syntheticRun();
  await database.runs.add(run);
  await database.routes.add({ id: run.id, segments: [[[0, 0]]], pointCount: 1, sampled: false });
  await database.imports.add(receipt);
  await database.staging.add({ ...run, id: 'staging' });
  await database.stagingRoutes.add({
    id: 'staging',
    segments: [[[0, 0]]],
    pointCount: 1,
    sampled: false,
  });
  await database.settings.put({ ...DEFAULT_GOALS, monthlyDistanceKm: 50 });
  const counts = await importedCounts(database);
  expect(counts).toEqual({
    runs: 1,
    routes: 1,
    imports: 1,
    stagedRuns: 1,
    stagedRoutes: 1,
    reviews: 0,
  });
  await clearImportedData(database, counts);
  expect(await importedCounts(database)).toEqual({
    runs: 0,
    routes: 0,
    imports: 0,
    stagedRuns: 0,
    stagedRoutes: 0,
    reviews: 0,
  });
  expect((await database.settings.get('goals'))?.monthlyDistanceKm).toBe(50);
  await stageImportRuns(database, [run]);
  expect((await commitStaging(database, false, receipt)).added).toBe(1);
});
it('削除確認後に件数が変われば削除せず再確認する', async () => {
  const database = create();
  await database.runs.add(syntheticRun());
  const counts = await importedCounts(database);
  await database.runs.add(syntheticRun({ id: 'another' }));
  await expect(clearImportedData(database, counts)).rejects.toThrow('再確認');
  expect(await database.runs.count()).toBe(2);
});
it('全削除の途中の失敗は全テーブルを復元する', async () => {
  const database = create();
  await database.runs.add(syntheticRun());
  await database.imports.add(receipt);
  const counts = await importedCounts(database);
  await expect(
    database.transaction(
      'rw',
      [
        database.runs,
        database.runReviews,
        database.routes,
        database.imports,
        database.staging,
        database.stagingRoutes,
      ],

      async () => {
        await clearImportedData(database, counts);
        throw new Error('synthetic failure');
      },
    ),
  ).rejects.toThrow('synthetic failure');
  expect(await importedCounts(database)).toEqual(counts);
});

it('同一IDの重複行のコース参照で最初の行を上書きせず、GPXも1回だけ保存する', async () => {
  const database = create();
  const first = detailedXml.match(/<Workout\s[\s\S]*?<\/Workout>/)![0];
  const repeated = detailedXml.replace(
    '</HealthData>',
    `${first.replace('/workout-routes/synthetic.gpx', '/workout-routes/missing.gpx')}</HealthData>`,
  );
  const zip = zipSync({
    'apple_health_export/export.xml': strToU8(repeated),
    'apple_health_export/workout-routes/synthetic.gpx': strToU8(gpx),
  });
  let duplicates = 0,
    routes = 0;
  const report = await importHealthFile(
    new File([zip], 'export.zip'),
    async (runs) => {
      const staged = await stageImportRuns(database, runs);
      duplicates += staged.duplicates;
      return staged.routeTargets;
    },
    undefined,
    undefined,
    async (route) => {
      routes++;
      await database.stagingRoutes.put(route);
    },
  );
  expect(duplicates).toBe(1);
  expect(routes).toBe(1);
  expect(Object.keys(report.warnings).some((key) => key.includes('コースを読み込め'))).toBe(false);
  expect((await commitStaging(database)).added).toBe(2);
  expect(await database.routes.count()).toBe(1);
});
