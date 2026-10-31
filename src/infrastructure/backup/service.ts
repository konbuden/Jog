import type { BackupSnapshot } from './format';
import { BACKUP_LIMITS, validateSnapshot } from './format';
import { RunningDatabase, saveRuns, sameRun, canEnrich } from '../db/database';
import { DEFAULT_GOALS } from '../../domain/models/goals';
export async function exportBackup(database: RunningDatabase, now = new Date().toISOString()) {
  const snapshot = await database.transaction(
    'r',
    database.runs,
    database.routes,
    database.settings,
    database.runReviews,
    async () => {
      if (
        (await database.runs.count()) > BACKUP_LIMITS.runs ||
        (await database.routes.count()) > BACKUP_LIMITS.routes
      )
        throw new Error('記録数・コース数がバックアップの上限を超えています。');
      const reviews = await database.runReviews.toArray();
      return {
        format: 'my-running-coach-backup',
        version: reviews.length ? 2 : 1,
        timeZone: 'Asia/Tokyo',
        exportedAt: now,
        runs: await database.runs.toArray(),
        routes: await database.routes.toArray(),
        goals: (await database.settings.get('goals')) ?? DEFAULT_GOALS,
        ...(reviews.length ? { reviews } : {}),
      };
    },
  );
  const valid = validateSnapshot(snapshot),
    blob = new Blob([JSON.stringify(valid)], { type: 'application/json' });
  if (blob.size > BACKUP_LIMITS.bytes)
    throw new Error('バックアップが200 MBを超えるため書き出せませんでした。');
  return {
    blob,
    runCount: valid.runs.length,
    routeCount: valid.routes.length,
    exportedAt: valid.exportedAt,
  };
}
export interface RestorePreview {
  runCount: number;
  newCount: number;
  duplicates: number;
  enhancedCount: number;
  conflicts: number;
  routeCount: number;
  newRouteCount: number;
  reviewCount: number;
  newReviewCount: number;
  from: string | null;
  through: string | null;
  exportedAt: string;
}
export async function previewBackup(
  database: RunningDatabase,
  snapshot: BackupSnapshot,
): Promise<RestorePreview> {
  return database.transaction(
    'r',
    [database.runs, database.routes, database.runReviews],
    async () => {
      let newCount = 0,
        duplicates = 0,
        conflicts = 0,
        newRouteCount = 0;
      const enhanced = new Set<string>(),
        eligible = new Set<string>();
      let from: string | null = null,
        through: string | null = null;
      for (const run of snapshot.runs) {
        if (from === null || run.startTime < from) from = run.startTime;
        if (through === null || run.startTime > through) through = run.startTime;
        const existing = await database.runs.get(run.id);
        if (!existing) {
          newCount++;
          eligible.add(run.id);
        } else {
          duplicates++;
          if (!sameRun(existing, run)) conflicts++;
          else {
            eligible.add(run.id);
            if (canEnrich(existing, run)) enhanced.add(run.id);
          }
        }
      }
      for (const route of snapshot.routes)
        if (eligible.has(route.id) && !(await database.routes.get(route.id))) {
          newRouteCount++;
          if (await database.runs.get(route.id)) enhanced.add(route.id);
        }
      let newReviewCount = 0;
      for (const review of snapshot.reviews ?? [])
        if (eligible.has(review.id) && !(await database.runReviews.get(review.id)))
          newReviewCount++;
      return {
        reviewCount: snapshot.reviews?.length ?? 0,
        newReviewCount,
        runCount: snapshot.runs.length,
        newCount,
        duplicates,
        conflicts,
        enhancedCount: enhanced.size,
        routeCount: snapshot.routes.length,
        newRouteCount,
        from,
        through,
        exportedAt: snapshot.exportedAt,
      };
    },
  );
}
export async function restoreBackup(
  database: RunningDatabase,
  snapshot: BackupSnapshot,
  restoreGoals: boolean,
) {
  return database.transaction(
    'rw',
    [database.runs, database.routes, database.settings, database.runReviews],
    async () => {
      let added = 0,
        duplicates = 0,
        conflicts = 0,
        routesAdded = 0,
        reviewsAdded = 0;
      const eligible = new Set<string>(),
        enhanced = new Set<string>(),
        newIds = new Set<string>();
      for (const run of snapshot.runs) {
        const existing = await database.runs.get(run.id);
        if (!existing) {
          newIds.add(run.id);
          eligible.add(run.id);
        } else if (sameRun(existing, run)) {
          eligible.add(run.id);
          if (canEnrich(existing, run)) enhanced.add(run.id);
        }
        const result = await saveRuns(database, [run], run.importedAt);
        added += result.added;
        duplicates += result.duplicates;
        conflicts += result.conflicts;
      }
      for (const route of snapshot.routes)
        if (eligible.has(route.id) && !(await database.routes.get(route.id))) {
          await database.routes.add(route);
          routesAdded++;
          if (!newIds.has(route.id)) enhanced.add(route.id);
        }
      for (const review of snapshot.reviews ?? [])
        if (eligible.has(review.id) && !(await database.runReviews.get(review.id))) {
          await database.runReviews.add(review);
          reviewsAdded++;
        }
      if (restoreGoals) await database.settings.put(snapshot.goals);
      return {
        added,
        duplicates,
        conflicts,
        updated: enhanced.size,
        routesAdded,
        reviewsAdded,
        goalsRestored: restoreGoals,
      };
    },
  );
}
