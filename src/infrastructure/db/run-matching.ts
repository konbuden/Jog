import type { Table } from 'dexie';
import type { RunCandidate } from '../../domain/models/run';
const external = (run: RunCandidate) =>
  run.sourceId.startsWith('uuid:') ? run.sourceId.slice(5).trim() : null;
const uuid = (value: string) => /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const rounded = (value: number) => Number(value.toFixed(6));
function naturalMatch(a: RunCandidate, b: RunCandidate) {
  const left = external(a),
    right = external(b);
  if (
    left &&
    right &&
    (uuid(left) && uuid(right) ? left.toLowerCase() !== right.toLowerCase() : left !== right)
  )
    return false;
  return (
    a.source === b.source &&
    a.sourceName === b.sourceName &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    rounded(a.distanceMeters) === rounded(b.distanceMeters) &&
    rounded(a.durationSeconds) === rounded(b.durationSeconds)
  );
}
export async function findRun<T extends RunCandidate>(
  table: Table<T, string>,
  run: RunCandidate,
): Promise<T | undefined> {
  const direct = await table.get(run.id);
  if (direct) return direct;
  const key = external(run);
  if (key) {
    const ids = uuid(key)
      ? Array.from(
          new Set([run.sourceId, `uuid:${key.toLowerCase()}`, `uuid:${key.toUpperCase()}`]),
        )
      : [run.sourceId];
    const match = await table
      .where('sourceId')
      .anyOf(ids)
      .filter(
        (existing) =>
          existing.source === run.source && (uuid(key) || existing.sourceName === run.sourceName),
      )
      .first();
    if (match) return match;
  }
  return table
    .where('[sourceName+startTime+endTime]')
    .equals([run.sourceName, run.startTime, run.endTime])
    .filter((existing) => naturalMatch(existing, run))
    .first();
}
