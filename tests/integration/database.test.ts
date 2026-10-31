import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { RunningDatabase, commitStaging, saveRuns } from '../../src/infrastructure/db/database';
import { syntheticRun } from '../fixtures/synthetic/run';

const databases: RunningDatabase[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});
function createDatabase() {
  const database = new RunningDatabase(crypto.randomUUID());
  databases.push(database);
  return database;
}

it('再取り込みしても重複せず、心拍の変更は既存値を保持する', async () => {
  const database = createDatabase();
  expect((await saveRuns(database, [syntheticRun()])).added).toBe(1);
  expect(await saveRuns(database, [syntheticRun({ averageHeartRateBpm: null })])).toEqual({
    added: 0,
    duplicates: 1,
    conflicts: 1,
    updated: 0,
  });
  expect(await database.runs.count()).toBe(1);
  expect((await database.runs.toArray())[0]?.averageHeartRateBpm).toBe(135);
});

it('プレビュー中は本データを変更せず、確定後に一時領域を空にする', async () => {
  const database = createDatabase();
  await database.staging.add(syntheticRun());
  expect(await database.runs.count()).toBe(0);
  expect((await commitStaging(database)).added).toBe(1);
  expect(await database.staging.count()).toBe(0);
  expect(await database.runs.count()).toBe(1);
});

it('確定処理に失敗した場合は追加も一時削除もロールバックする', async () => {
  const database = createDatabase();
  const run = syntheticRun();
  await database.staging.add(run);
  await database.stagingRoutes.add({
    id: run.id,
    segments: [
      [
        [0, 0],
        [0, 0.01],
      ],
    ],
    pointCount: 2,
    sampled: false,
  });
  await expect(
    database.transaction(
      'rw',
      database.runs,
      database.staging,
      database.routes,
      database.stagingRoutes,
      database.imports,
      async () => {
        await commitStaging(database);
        throw new Error('synthetic failure');
      },
    ),
  ).rejects.toThrow('synthetic failure');
  expect(await database.runs.count()).toBe(0);
  expect(await database.staging.count()).toBe(1);
  expect(await database.routes.count()).toBe(0);
  expect(await database.stagingRoutes.count()).toBe(1);
});

it('複数バッチにまたがる確定でも既存データを保ち、すべての新規データを保存する', async () => {
  const database = createDatabase();
  const runs = Array.from({ length: 201 }, (_, i) =>
    syntheticRun({
      id: `synthetic-${i}`,
      startTime: new Date(Date.UTC(2026, 0, 1) + i * 3600000).toISOString(),
      endTime: new Date(Date.UTC(2026, 0, 1) + i * 3600000 + 1800000).toISOString(),
    }),
  );
  await saveRuns(database, [runs[0]!]);
  await database.staging.bulkAdd(runs);
  expect(await commitStaging(database)).toEqual({
    added: 200,
    duplicates: 1,
    conflicts: 0,
    updated: 0,
  });
  expect(await database.runs.count()).toBe(201);
  expect(await database.staging.count()).toBe(0);
});

it('再取り込みでは欠損詳細だけを追加し、記録IDと既存値を保つ', async () => {
  const database = createDatabase();
  await saveRuns(database, [syntheticRun({ details: { activeEnergyKcal: 200 } })]);
  const result = await saveRuns(database, [
    syntheticRun({ details: { activeEnergyKcal: 300, totalSteps: 5400 } }),
  ]);
  expect(result.updated).toBe(1);
  expect(await database.runs.count()).toBe(1);
  expect((await database.runs.toArray())[0]?.details).toEqual({
    activeEnergyKcal: 200,
    totalSteps: 5400,
  });
});
it('コースも保存確定まで本データを変えず、キャンセル・失敗で残さない', async () => {
  const database = createDatabase();
  const run = syntheticRun();
  await database.staging.add(run);
  await database.stagingRoutes.add({
    id: run.id,
    segments: [
      [
        [0, 0],
        [0, 0.01],
      ],
    ],
    pointCount: 2,
    sampled: false,
  });
  expect(await database.routes.count()).toBe(0);
  expect((await commitStaging(database)).added).toBe(1);
  expect(await database.routes.count()).toBe(1);
  expect(await database.stagingRoutes.count()).toBe(0);
  await database.stagingRoutes.add({ id: 'orphan', segments: [], pointCount: 0, sampled: false });
  await commitStaging(database);
  expect(await database.routes.count()).toBe(1);
});

it('v1データベースから更新しても既存ランを保持する', async () => {
  const { default: Dexie } = await import('dexie');
  const name = crypto.randomUUID();
  const old = new Dexie(name);
  old.version(1).stores({ runs: '&id,startTime', staging: '&id,startTime' });
  await old.table('runs').add(syntheticRun());
  old.close();
  const database = new RunningDatabase(name);
  databases.push(database);
  expect(await database.runs.count()).toBe(1);
  expect(await database.routes.count()).toBe(0);
});
