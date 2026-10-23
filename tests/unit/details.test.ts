import { expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importHealthFile } from '../../src/infrastructure/apple-health/import-file';
import { GpxParser, routeEntryName } from '../../src/infrastructure/apple-health/gpx';
import { routeGeometry } from '../../src/domain/analytics/route';
import { detailedXml, gpx, baseXml } from '../fixtures/synthetic/details';
import type { RunCandidate, RunRoute } from '../../src/domain/models/run';
async function parse(xml: string, route?: string) {
  const runs: RunCandidate[] = [],
    routes: RunRoute[] = [];
  const file =
    route === undefined
      ? new File([xml], 'export.xml')
      : new File(
          [
            zipSync({
              'apple_health_export/export.xml': strToU8(xml),
              'apple_health_export/workout-routes/synthetic.gpx': strToU8(route),
            }),
          ],
          'export.zip',
        );
  const report = await importHealthFile(
    file,
    async (batch) => {
      runs.push(...batch);
    },
    undefined,
    undefined,
    async (route) => {
      routes.push(route);
    },
  );
  return { runs, routes, report };
}
it('同じWorkout内の追加統計を正規化し、IDを変えない', async () => {
  const result = await parse(detailedXml);
  expect(result.runs[0]?.details).toMatchObject({
    totalSteps: 5400,
    averageCadenceSpm: 180,
    cadenceOrigin: 'steps-duration',
    activeEnergyKcal: 300,
    averagePowerWatts: 250,
    averageStrideLengthMeters: 1.1,
    averageGroundContactMilliseconds: 250,
    averageVerticalOscillationCentimeters: 8,
    maximumHeartRateBpm: 170,
    elevationAscendedMeters: 40,
    indoor: false,
  });
  expect(result.runs[0]?.id).toBe((await parse(baseXml)).runs[0]?.id);
  expect(result.routes).toHaveLength(0);
  expect(Object.keys(result.report.warnings).join()).toContain('XML単体');
});
it('参照GPXだけを読み、区間をつながず、正しいランに紐付ける', async () => {
  const result = await parse(detailedXml, gpx);
  expect(result.routes).toHaveLength(1);
  expect(result.routes[0]).toMatchObject({ id: result.runs[0]?.id, pointCount: 5, sampled: false });
  expect(result.routes[0]?.segments.map((s) => s.length)).toEqual([3, 2]);
  expect(result.runs[1]?.details?.routeFiles).toBeUndefined();
});
it('GPXなし・壊れた座標・外部参照・不正参照では走行記録だけを残し警告する', async () => {
  for (const route of [
    '<gpx><trkpt lat="NaN" lon="0"/></gpx>',
    '<!DOCTYPE gpx SYSTEM "https://example.invalid/"><gpx/>',
  ]) {
    const result = await parse(detailedXml, route);
    expect(result.runs).toHaveLength(2);
    expect(result.routes).toHaveLength(0);
    expect(Object.keys(result.report.warnings).join()).toContain('コース');
  }
  expect(
    (
      await parse(
        detailedXml.replace('/workout-routes/synthetic.gpx', '/workout-routes/missing.gpx'),
        gpx,
      )
    ).routes,
  ).toHaveLength(0);
  expect(routeEntryName('apple_health_export/export.xml', '../secret.gpx')).toBeNull();
  expect(
    routeEntryName('apple_health_export/export.xml', 'https://example.invalid/a.gpx'),
  ).toBeNull();
});
it('独立Recordと曖昧なWorkout統計から補完しない', async () => {
  const input = detailedXml
    .replace(
      '</HealthData>',
      '<Record type="HKQuantityTypeIdentifierRunningPower" value="999" unit="W"/></HealthData>',
    )
    .replace('unit="W"', 'unit="unknown"')
    .replace(
      '<WorkoutStatistics type="HKQuantityTypeIdentifierStepCount" sum="5400" unit="count"/>',
      '<WorkoutStatistics type="HKQuantityTypeIdentifierStepCount" sum="5400" unit="count"/><WorkoutStatistics type="HKQuantityTypeIdentifierStepCount" sum="5400" unit="count"/>',
    );
  const result = await parse(input);
  expect(result.runs[0]?.details?.averagePowerWatts).toBeUndefined();
  expect(result.runs[0]?.details?.averageCadenceSpm).toBeUndefined();
});
it('大量GPS点を保持せず間引き、日付変更線をまたぐコースを描画する', () => {
  const parser = new GpxParser();
  parser.write('<gpx><trk><trkseg>');
  for (let i = 0; i < 10000; i++)
    parser.write(`<trkpt lat="0" lon="${i % 2 ? 179.99 : -179.99}"/>`);
  parser.write('</trkseg></trk></gpx>');
  const route = parser.finish('a');
  expect(route.pointCount).toBe(10000);
  expect(route.sampled).toBe(true);
  expect(route.segments.flat().length).toBeLessThanOrEqual(2100);
  const geometry = routeGeometry(route);
  expect(geometry.flat().every((p) => p.every(Number.isFinite))).toBe(true);
});
