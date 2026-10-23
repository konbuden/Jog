import Dexie, { type Table } from 'dexie';
import type { Run, RunCandidate } from '../../domain/models/run';

export class RunningDatabase extends Dexie {
  runs!: Table<Run, string>;
  staging!: Table<RunCandidate, string>;

  constructor(name = 'my-running-coach-v1') {
    super(name);
    this.version(1).stores({ runs: '&id,startTime', staging: '&id,startTime' });
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

/** Atomic and bounded batches; existing values always win, even across overlapping exports. */
export async function saveRuns(
  database: RunningDatabase,
  candidates: readonly RunCandidate[],
  importedAt = new Date().toISOString(),
) {
  return database.transaction('rw', database.runs, async () => {
    let added = 0,
      duplicates = 0,
      conflicts = 0;
    for (const candidate of candidates) {
      const existing = await database.runs.get(candidate.id);
      if (existing) {
        duplicates++;
        if (!sameRun(existing, candidate)) conflicts++;
      } else {
        await database.runs.add({ ...candidate, importedAt });
        added++;
      }
    }
    return { added, duplicates, conflicts };
  });
}

export async function commitStaging(database = db) {
  const importedAt = new Date().toISOString();
  return database.transaction('rw', database.runs, database.staging, async () => {
    let added = 0,
      duplicates = 0,
      conflicts = 0;
    while (true) {
      const batch = await database.staging.limit(100).toArray();
      if (batch.length === 0) break;
      const result = await saveRuns(database, batch, importedAt);
      added += result.added;
      duplicates += result.duplicates;
      conflicts += result.conflicts;
      await database.staging.bulkDelete(batch.map((run) => run.id));
    }
    return { added, duplicates, conflicts };
  });
}
