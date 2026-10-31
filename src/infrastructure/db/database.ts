import type { RunReview } from '../../domain/models/review';
import type { GoalSettings } from '../../domain/models/goals';
import type { ImportReceipt } from './import-records';
import { findRun } from './run-matching';
import Dexie, { type Table } from 'dexie';
import type { Run, RunCandidate, RunRoute } from '../../domain/models/run';

export class RunningDatabase extends Dexie {
  runs!: Table<Run, string>;
  staging!: Table<RunCandidate, string>;

  routes!: Table<RunRoute, string>;
  stagingRoutes!: Table<RunRoute, string>;

  settings!: Table<GoalSettings, string>;

  imports!: Table<ImportReceipt, string>;
  runReviews!: Table<RunReview, string>;

  constructor(name = 'my-running-coach-v1') {
    super(name);
    this.version(1).stores({ runs: '&id,startTime', staging: '&id,startTime' });
    this.version(2).stores({ routes: '&id', stagingRoutes: '&id' });
    this.version(3).stores({ settings: '&id' });
    this.version(4).stores({
      runs: '&id,startTime,sourceId,[sourceName+startTime+endTime]',
      staging: '&id,startTime,sourceId,[sourceName+startTime+endTime]',
      imports: '&id',
    });
    this.version(5).stores({ runReviews: '&id' });
  }
}

export const db = new RunningDatabase();

export function sameRun(a: RunCandidate, b: RunCandidate): boolean {
  return (
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.distanceMeters === b.distanceMeters &&
    a.durationSeconds === b.durationSeconds &&
    a.averageHeartRateBpm === b.averageHeartRateBpm
  );
}

export function canEnrich(existing: RunCandidate, incoming: RunCandidate): boolean {
  return (
    sameRun(existing, incoming) &&
    Object.entries(incoming.details ?? {}).some(
      ([key, value]) =>
        value !== undefined &&
        existing.details?.[key as keyof NonNullable<Run['details']>] === undefined,
    )
  );
}

/** Atomic and bounded batches; existing values always win, even across overlapping exports. */
export async function saveRuns(
  database: RunningDatabase,
  candidates: readonly RunCandidate[],
  importedAt = new Date().toISOString(),
) {
  return database.transaction('rw', database.runs, async () => {
    let added = 0,
      duplicates = 0,
      conflicts = 0,
      updated = 0;
    for (const candidate of candidates) {
      const existing = await database.runs.get(candidate.id);
      if (existing) {
        duplicates++;
        if (!sameRun(existing, candidate)) conflicts++;
        else if (canEnrich(existing, candidate)) {
          await database.runs.put({
            ...existing,
            details: { ...candidate.details, ...existing.details },
          });
          updated++;
        }
      } else {
        await database.runs.add({ ...candidate, importedAt });
        added++;
      }
    }
    return { added, duplicates, conflicts, updated };
  });
}

export async function commitStaging(
  database = db,
  includeExistingDetails = false,
  receipt?: ImportReceipt,
) {
  const importedAt = new Date().toISOString();
  return database.transaction(
    'rw',
    database.runs,
    database.staging,
    database.routes,
    database.stagingRoutes,
    database.imports,
    async () => {
      let added = 0,
        duplicates = 0,
        conflicts = 0;
      const newIds = new Set<string>(),
        updatedIds = new Set<string>(),
        routeTargets = new Map<string, string>(),
        rejected = new Set<string>();
      while (true) {
        const batch = await database.staging.limit(100).toArray();
        if (!batch.length) break;
        for (const candidate of batch) {
          const existing = await findRun(database.runs, candidate);
          if (existing) {
            duplicates++;
            if (!sameRun(existing, candidate)) {
              conflicts++;
              rejected.add(candidate.id);
              continue;
            }
            if (!includeExistingDetails) rejected.add(candidate.id);
            if (includeExistingDetails) {
              if (canEnrich(existing, candidate)) {
                await database.runs.put({
                  ...existing,
                  details: { ...candidate.details, ...existing.details },
                });
                updatedIds.add(existing.id);
              }
              routeTargets.set(candidate.id, existing.id);
            }
          } else {
            await database.runs.add({ ...candidate, importedAt });
            newIds.add(candidate.id);
            routeTargets.set(candidate.id, candidate.id);
            added++;
          }
        }
        await database.staging.bulkDelete(batch.map((run) => run.id));
      }
      while (true) {
        const batch = await database.stagingRoutes.limit(50).toArray();
        if (!batch.length) break;
        for (const route of batch) {
          const target =
            routeTargets.get(route.id) ??
            (!rejected.has(route.id) &&
            includeExistingDetails &&
            (await database.runs.get(route.id))
              ? route.id
              : undefined);
          if (target && !(await database.routes.get(target))) {
            await database.routes.add({ ...route, id: target });
            if (!newIds.has(target)) updatedIds.add(target);
          }
        }
        await database.stagingRoutes.bulkDelete(batch.map((route) => route.id));
      }
      if (receipt) await database.imports.put(receipt);
      return { added, duplicates, conflicts, updated: updatedIds.size };
    },
  );
}
