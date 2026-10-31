import type { RunReview } from '../../domain/models/review';
import { validateReview } from '../../domain/analytics/review';
import { db, type RunningDatabase } from './database';
export async function saveReview(
  database: RunningDatabase,
  review: RunReview,
  expectedRevision: string | null,
): Promise<RunReview> {
  return database.transaction('rw', database.runs, database.runReviews, async () => {
    const run = await database.runs.get(review.id);
    if (!run) throw new Error('対象のランニングが削除されています。画面を更新してください。');
    const current = await database.runReviews.get(review.id);
    if ((current?.revision ?? null) !== expectedRevision)
      throw new Error('別の画面で振り返りが更新されました。保存済み内容を読み直してください。');
    const error = validateReview(review, run);
    if (error) throw new Error(error);
    const saved = { ...review, updatedAt: new Date().toISOString(), revision: crypto.randomUUID() };
    await database.runReviews.put(saved);
    return saved;
  });
}
export async function saveReviewWithLock(review: RunReview, expectedRevision: string | null) {
  if (!navigator.locks)
    throw new Error('このブラウザでは安全に保存できません。最新のブラウザをご利用ください。');
  return navigator.locks.request('my-running-coach-import', { ifAvailable: true }, async (lock) => {
    if (!lock)
      throw new Error('別のタブで取り込み・復元・設定変更中です。完了してから保存してください。');
    return saveReview(db, review, expectedRevision);
  });
}
