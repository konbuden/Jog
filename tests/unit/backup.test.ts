import { expect, it } from 'vitest';
import { readBackup, validateSnapshot } from '../../src/infrastructure/backup/format';
import { syntheticBackup } from '../fixtures/synthetic/backup';
it('バックアップを元の日時・欠損値・コース・目標を保持して検証する', async () => {
  const snapshot = syntheticBackup();
  snapshot.runs[0]!.averageHeartRateBpm = null;
  snapshot.runs[0]!.heartRateOrigin = null;
  expect(await readBackup(new Blob([JSON.stringify(snapshot)]))).toEqual(snapshot);
});
it.each([
  'version',
  'format',
  'timezone',
  'date',
  'pace',
  'heart',
  'id',
  'details',
  'goal',
  'duplicate',
  'orphan',
  'coordinate',
  'segments',
  'points',
] as const)('不正なバックアップを拒否する: %s', (kind) => {
  const snapshot = syntheticBackup();
  const run = snapshot.runs[0]!,
    route = snapshot.routes[0]!;
  switch (kind) {
    case 'version':
      Object.assign(snapshot, { version: 2 });
      break;
    case 'format':
      Object.assign(snapshot, { format: 'other' });
      break;
    case 'timezone':
      Object.assign(snapshot, { timeZone: 'UTC' });
      break;
    case 'date':
      run.startTime = '2026-02-30T00:00:00.000Z';
      break;
    case 'pace':
      run.paceSecondsPerKm = 1;
      break;
    case 'heart':
      run.averageHeartRateBpm = NaN;
      break;
    case 'id':
      run.id = 'x';
      break;
    case 'details':
      run.details!.averageCadenceSpm = Infinity;
      break;
    case 'goal':
      snapshot.goals.weeklyRunCount = 1.5;
      break;
    case 'duplicate':
      snapshot.runs.push({ ...run });
      break;
    case 'orphan':
      route.id = 'b'.repeat(64);
      break;
    case 'coordinate':
      route.segments[0]![0]![0] = 91;
      break;
    case 'segments':
      route.segments = Array.from({ length: 65 }, () => [[0, 0]]);
      route.pointCount = 65;
      break;
    case 'points':
      route.pointCount = 1;
      break;
  }
  expect(() => validateSnapshot(snapshot)).toThrow();
});
it('空・不正JSON・容量超過は読み込み前に日本語エラーにする', async () => {
  await expect(readBackup(new Blob())).rejects.toThrow('空');
  await expect(readBackup(new Blob(['invalid']))).rejects.toThrow('JSON');
  const file = new Blob(['{}']);
  Object.defineProperty(file, 'size', { value: 200_000_001 });
  await expect(readBackup(file)).rejects.toThrow('200 MB');
});

it.each(['runs', 'routes', 'points'] as const)('件数・保存点の上限を検証する: %s', (kind) => {
  const snapshot = syntheticBackup();
  if (kind === 'runs') snapshot.runs = Array(100_001).fill(snapshot.runs[0]);
  else if (kind === 'routes') snapshot.routes = Array(10_001).fill(snapshot.routes[0]);
  else {
    snapshot.routes[0]!.segments = [Array.from({ length: 4097 }, () => [0, 0] as [number, number])];
    snapshot.routes[0]!.pointCount = 4097;
  }
  expect(() => validateSnapshot(snapshot)).toThrow();
});
