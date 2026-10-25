import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import Dexie from 'dexie';
import { RunningDatabase } from '../../src/infrastructure/db/database';
import {
  exportBackup,
  previewBackup,
  restoreBackup,
} from '../../src/infrastructure/backup/service';
import { readBackup } from '../../src/infrastructure/backup/format';
import { syntheticBackup } from '../fixtures/synthetic/backup';
const databases: RunningDatabase[] = [];
function create() {
  const database = new RunningDatabase(crypto.randomUUID());
  databases.push(database);
  return database;
}
afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});
it('確認中は変更せず、日時・コース・目標を復元して再復元で重複しない', async () => {
  const database = create(),
    snapshot = syntheticBackup();
  expect(await previewBackup(database, snapshot)).toMatchObject({
    newCount: 1,
    duplicates: 0,
    newRouteCount: 1,
  });
  expect(await database.runs.count()).toBe(0);
  expect(await database.routes.count()).toBe(0);
  expect(await database.settings.count()).toBe(0);
  expect(await restoreBackup(database, snapshot, true)).toMatchObject({
    added: 1,
    routesAdded: 1,
    goalsRestored: true,
  });
  expect(await database.runs.get(snapshot.runs[0]!.id)).toEqual(snapshot.runs[0]);
  expect(await database.settings.get('goals')).toEqual(snapshot.goals);
  expect(await restoreBackup(database, snapshot, true)).toMatchObject({
    added: 0,
    duplicates: 1,
    updated: 0,
    routesAdded: 0,
  });
  expect(await database.runs.count()).toBe(1);
  const exported = await exportBackup(database, snapshot.exportedAt);
  expect(await readBackup(exported.blob)).toEqual(snapshot);
});
it('欠けた詳細だけを補い、既存の追加値とimportedAt・目標を保持できる', async () => {
  const database = create(),
    snapshot = syntheticBackup(),
    run = snapshot.runs[0]!;
  run.details!.activeEnergyKcal = 300;
  const existing = {
    ...run,
    details: { activeEnergyKcal: 200 },
    importedAt: '2026-10-01T00:00:00.000Z',
  };
  await database.runs.add(existing);
  await database.settings.put({ ...snapshot.goals, monthlyDistanceKm: 80 });
  expect(await previewBackup(database, snapshot)).toMatchObject({
    newCount: 0,
    duplicates: 1,
    enhancedCount: 1,
  });
  expect(await restoreBackup(database, snapshot, false)).toMatchObject({
    added: 0,
    updated: 1,
    goalsRestored: false,
  });
  const restored = await database.runs.get(run.id);
  expect(restored?.details).toMatchObject({ averageCadenceSpm: 180, activeEnergyKcal: 200 });
  expect(restored?.importedAt).toBe(existing.importedAt);
  expect((await database.settings.get('goals'))?.monthlyDistanceKm).toBe(80);
});
it('主要数値の相違は既存値を保持し、そのコースも結び付けない', async () => {
  const database = create(),
    snapshot = syntheticBackup(),
    run = snapshot.runs[0]!;
  await database.runs.add({
    ...run,
    distanceMeters: 6000,
    paceSecondsPerKm: 300,
    details: undefined,
  });
  expect(await previewBackup(database, snapshot)).toMatchObject({ conflicts: 1, newRouteCount: 0 });
  expect(await restoreBackup(database, snapshot, false)).toMatchObject({
    conflicts: 1,
    routesAdded: 0,
    updated: 0,
  });
  expect((await database.runs.get(run.id))?.distanceMeters).toBe(6000);
});
it('復元途中の失敗で記録・コース・目標をすべてロールバックする', async () => {
  const database = create(),
    snapshot = syntheticBackup();
  await database.settings.put({ ...snapshot.goals, monthlyDistanceKm: 80 });
  database.routes.hook('creating', () => {
    throw new Error('synthetic failure');
  });
  await expect(restoreBackup(database, snapshot, true)).rejects.toThrow('synthetic failure');
  expect(await database.runs.count()).toBe(0);
  expect(await database.routes.count()).toBe(0);
  expect((await database.settings.get('goals'))?.monthlyDistanceKm).toBe(80);
});
it('v2→v3で既存ランとコースを保持し、目標未設定を許容する', async () => {
  const name = crypto.randomUUID(),
    old = new Dexie(name),
    snapshot = syntheticBackup();
  old.version(2).stores({
    runs: '&id,startTime',
    staging: '&id,startTime',
    routes: '&id',
    stagingRoutes: '&id',
  });
  await old.table('runs').add(snapshot.runs[0]);
  await old.table('routes').add(snapshot.routes[0]);
  old.close();
  const database = new RunningDatabase(name);
  databases.push(database);
  expect(await database.runs.count()).toBe(1);
  expect(await database.routes.count()).toBe(1);
  expect(await database.settings.count()).toBe(0);
});

it('同じランの既存コースは別の座標で上書きしない', async () => {
  const database = create(),
    snapshot = syntheticBackup();
  await restoreBackup(database, snapshot, false);
  const before = await database.routes.get(snapshot.runs[0]!.id);
  snapshot.routes[0]!.segments = [
    [
      [1, 1],
      [1, 1.01],
    ],
  ];
  expect(await restoreBackup(database, snapshot, false)).toMatchObject({
    added: 0,
    updated: 0,
    routesAdded: 0,
  });
  expect(await database.routes.get(snapshot.runs[0]!.id)).toEqual(before);
});
