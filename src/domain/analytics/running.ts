import type { Run, RunFilter } from '../models/run';
import { dateKey, monthKey } from './time';

export function calculatePace(distanceMeters: number, durationSeconds: number): number | null {
  return Number.isFinite(distanceMeters) &&
    Number.isFinite(durationSeconds) &&
    distanceMeters > 0 &&
    durationSeconds > 0
    ? (durationSeconds * 1000) / distanceMeters
    : null;
}

export function equivalent10Km(distanceMeters: number, durationSeconds: number): number | null {
  const pace = calculatePace(distanceMeters, durationSeconds);
  return pace === null ? null : pace * 10;
}

export function summarize(runs: readonly Run[]) {
  const distanceMeters = runs.reduce((sum, run) => sum + run.distanceMeters, 0);
  const durationSeconds = runs.reduce((sum, run) => sum + run.durationSeconds, 0);
  const withHeartRate = runs.filter((run) => run.averageHeartRateBpm !== null);
  const heartDuration = withHeartRate.reduce((sum, run) => sum + run.durationSeconds, 0);
  return {
    count: runs.length,
    distanceMeters,
    durationSeconds,
    paceSecondsPerKm: calculatePace(distanceMeters, durationSeconds),
    averageHeartRateBpm:
      heartDuration > 0
        ? withHeartRate.reduce(
            (sum, run) => sum + run.averageHeartRateBpm! * run.durationSeconds,
            0,
          ) / heartDuration
        : null,
    heartRateCount: withHeartRate.length,
    goalPercent: (distanceMeters / 100_000) * 100,
  };
}

export function filterRuns(runs: readonly Run[], filter: RunFilter): Run[] {
  return runs.filter((run) => {
    const km = run.distanceMeters / 1000;
    const date = dateKey(run.startTime);
    const hr = run.averageHeartRateBpm;
    return (
      (filter.minDistanceKm === undefined || km >= filter.minDistanceKm) &&
      (filter.maxDistanceKm === undefined || km < filter.maxDistanceKm) &&
      (!filter.from || date >= filter.from) &&
      (!filter.through || date <= filter.through) &&
      (!filter.missingHeartRateOnly || hr === null) &&
      (filter.minHeartRate === undefined || (hr !== null && hr >= filter.minHeartRate)) &&
      (filter.maxHeartRate === undefined || (hr !== null && hr < filter.maxHeartRate))
    );
  });
}

export function monthlySummary(runs: readonly Run[], months: readonly string[]) {
  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    const key = monthKey(run.startTime);
    const group = groups.get(key) ?? [];
    group.push(run);
    groups.set(key, group);
  }
  return months.map((month) => ({ month, ...summarize(groups.get(month) ?? []) }));
}
