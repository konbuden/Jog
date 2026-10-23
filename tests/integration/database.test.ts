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
  await database.staging.add(syntheticRun());
  await expect(
    database.transaction('rw', database.runs, database.staging, async () => {
      await commitStaging(database);
      throw new Error('synthetic failure');
    }),
  ).rejects.toThrow('synthetic failure');
  expect(await database.runs.count()).toBe(0);
  expect(await database.staging.count()).toBe(1);
});

it('複数バッチにまたがる確定でも既存データを保ち、すべての新規データを保存する', async () => {
  const database = createDatabase();
  const runs = Array.from({ length: 201 }, (_, i) => syntheticRun({ id: `synthetic-${i}` }));
  await saveRuns(database, [runs[0]!]);
  await database.staging.bulkAdd(runs);
  expect(await commitStaging(database)).toEqual({ added: 200, duplicates: 1, conflicts: 0 });
  expect(await database.runs.count()).toBe(201);
  expect(await database.staging.count()).toBe(0);
});
