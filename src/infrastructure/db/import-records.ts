import type { RunCandidate } from '../../domain/models/run';
import type { RunningDatabase } from './database';
import { canEnrich, sameRun } from './database';
import { findRun } from './run-matching';
import type { ParseReport } from '../apple-health/parser';
export interface ImportReceipt {
  id: string;
  inputBytes: number;
  importedAt: string;
  validCount: number;
  firstTime: string | null;
  lastTime: string | null;
  report: ParseReport;
}
export async function stageImportRuns(
  database: RunningDatabase,
  runs: readonly RunCandidate[],
  includeExistingDetails = false,
) {
  return database.transaction('rw', database.staging, database.runs, database.routes, async () => {
    let added = 0,
      duplicates = 0,
      conflicts = 0;
    let firstTime: string | null = null,
      lastTime: string | null = null;
    const enhanced = new Set<string>(),
      routeTargets = new Map<string, string>();
    for (const run of runs) {
      const existing =
        (await findRun(database.staging, run)) ?? (await findRun(database.runs, run));
      if (existing) {
        duplicates++;
        if (!sameRun(existing, run)) {
          conflicts++;
          continue;
        }
        if (!includeExistingDetails) continue;
        if (canEnrich(existing, run)) {
          await database.staging.put({
            ...existing,
            details: { ...run.details, ...existing.details },
          });
          if (await database.runs.get(existing.id)) enhanced.add(existing.id);
        }
        if (run.details?.routeFiles?.length && !(await database.routes.get(existing.id)))
          routeTargets.set(run.id, existing.id);
      } else {
        await database.staging.add(run);
        added++;
        routeTargets.set(run.id, run.id);
        if (firstTime === null || run.startTime < firstTime) firstTime = run.startTime;
        if (lastTime === null || run.startTime > lastTime) lastTime = run.startTime;
      }
    }
    return { added, duplicates, conflicts, enhanced, routeTargets, firstTime, lastTime };
  });
}
