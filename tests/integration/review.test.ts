import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, it } from 'vitest';
import { RunningDatabase } from '../../src/infrastructure/db/database';
import { saveReview } from '../../src/infrastructure/db/reviews';
import { importedCounts, clearImportedData } from '../../src/infrastructure/db/delete-imported';
import {
  exportBackup,
  restoreBackup,
  previewBackup,
} from '../../src/infrastructure/backup/service';
import { readBackup, validateSnapshot } from '../../src/infrastructure/backup/format';
import { reviewedRun, syntheticReview } from '../fixtures/synthetic/review';
import { syntheticBackup } from '../fixtures/synthetic/backup';
const databases: RunningDatabase[] = [];
const create = () => {
  const database = new RunningDatabase(crypto.randomUUID());
  databases.push(database);
  return database;
};
afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});
it('振り返りを保存し、更新競合・不正値・削除済みランを拒否する', async () => {
  const database = create(),
    run = reviewedRun();
  await database.runs.add(run);
  const saved = await saveReview(database, syntheticReview(), null);
  expect(saved.revision).not.toBe(syntheticReview().revision);
  expect((await database.runReviews.get(run.id))!.rpe).toBe(4);
  await expect(saveReview(database, { ...saved, rpe: 2 }, null)).rejects.toThrow('更新');
  await expect(saveReview(database, { ...saved, rpe: 11 }, saved.revision)).rejects.toThrow('RPE');
  const next = await saveReview(database, { ...saved, nextDay: 'normal' }, saved.revision);
  expect(next.revision).not.toBe(saved.revision);
  await database.runs.delete(run.id);
  await expect(saveReview(database, next, next.revision)).rejects.toThrow('削除');
});
it('レビュー付きバックアップを往復し、既存振り返りを上書きせず不足分だけ復元する', async () => {
  const source = create(),
    target = create();
  await source.runs.add(reviewedRun());
  const saved = await saveReview(source, syntheticReview(), null);
  const exported = await exportBackup(source);
  const snapshot = await readBackup(exported.blob);
  expect(snapshot.version).toBe(2);
  expect(snapshot.reviews).toEqual([saved]);
  expect(await previewBackup(target, snapshot)).toMatchObject({
    reviewCount: 1,
    newReviewCount: 1,
  });
  expect((await restoreBackup(target, snapshot, true)).reviewsAdded).toBe(1);
  expect(await target.runReviews.get(saved.id)).toEqual(saved);
  const newer = await saveReview(target, { ...saved, nextDay: 'tired' }, saved.revision);
  expect((await restoreBackup(target, snapshot, true)).reviewsAdded).toBe(0);
  expect(await target.runReviews.get(saved.id)).toEqual(newer);
});
it('主要値が異なるランへ振り返りを復元せず、旧バックアップも読める', async () => {
  const database = create(),
    snapshot = {
      ...syntheticBackup(),
      version: 2 as const,
      runs: [reviewedRun()],
      routes: [],
      reviews: [syntheticReview()],
    };
  await database.runs.add({ ...reviewedRun(), durationSeconds: 4000, paceSecondsPerKm: 400 });
  expect((await restoreBackup(database, snapshot, false)).reviewsAdded).toBe(0);
  expect(await database.runReviews.count()).toBe(0);
  expect(validateSnapshot(syntheticBackup()).reviews).toBeUndefined();
});
it.each(['orphan', 'duplicate', 'rpe', 'laps', 'time', 'revision', 'purpose'] as const)(
  '不正なレビュー付きバックアップを拒否する: %s',
  (kind) => {
    const snapshot = {
      ...syntheticBackup(),
      version: 2 as const,
      runs: [reviewedRun()],
      routes: [],
      reviews: [syntheticReview()],
    };
    const review = snapshot.reviews[0]!;
    if (kind === 'orphan') review.id = 'd'.repeat(64);
    if (kind === 'duplicate') snapshot.reviews.push({ ...review });
    if (kind === 'rpe') review.rpe = 11;
    if (kind === 'laps') review.laps = review.laps.slice(0, 2);
    if (kind === 'time') review.updatedAt = 'invalid';
    if (kind === 'revision') review.revision = '';
    if (kind === 'purpose') Object.assign(review, { purpose: 'invalid' });
    expect(() => validateSnapshot(snapshot)).toThrow();
  },
);
it('全削除は振り返りも消し、失敗したトランザクションでは全件を保持する', async () => {
  const database = create();
  await database.runs.add(reviewedRun());
  await saveReview(database, syntheticReview(), null);
  const counts = await importedCounts(database);
  expect(counts.reviews).toBe(1);
  await expect(
    database.transaction('rw', database.tables, async () => {
      await clearImportedData(database, counts);
      throw new Error('synthetic rollback');
    }),
  ).rejects.toThrow('synthetic rollback');
  expect(await importedCounts(database)).toEqual(counts);
  await clearImportedData(database, counts);
  expect(await database.runReviews.count()).toBe(0);
  expect(await database.runs.count()).toBe(0);
});
it('v4からv5へ既存データ・目標・取り込み履歴を保って移行する', async () => {
  const name = crypto.randomUUID(),
    old = new Dexie(name),
    snapshot = syntheticBackup();
  old.version(4).stores({
    runs: '&id,startTime,sourceId,[sourceName+startTime+endTime]',
    staging: '&id,startTime,sourceId,[sourceName+startTime+endTime]',
    routes: '&id',
    stagingRoutes: '&id',
    settings: '&id',
    imports: '&id',
  });
  await old.table('runs').add(reviewedRun());
  await old.table('settings').add(snapshot.goals);
  old.close();
  const database = new RunningDatabase(name);
  databases.push(database);
  expect(await database.runs.get(reviewedRun().id)).toEqual(reviewedRun());
  expect(await database.settings.get('goals')).toEqual(snapshot.goals);
  expect(await database.runReviews.count()).toBe(0);
});

it('新形式の振り返り欠損と旧形式への紛れ込みを拒否する', () => {
  expect(() => validateSnapshot({ ...syntheticBackup(), version: 2 })).toThrow();
  expect(() => validateSnapshot({ ...syntheticBackup(), reviews: [] })).toThrow();
});
