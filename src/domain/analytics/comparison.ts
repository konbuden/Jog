import type { Run, RunFilter } from '../models/run';
import { periodMonths, selectPeriod, validMonth } from './period';
import { filterRuns, summarize } from './running';
import { dateKey } from './time';
export interface MonthRange {
  from: string;
  through: string;
}
export function shiftMonth(month: string, delta: number): string {
  if (!validMonth(month)) return '';
  const value = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + delta;
  const year = Math.floor(value / 12);
  return year < 1900 || year > 9999 ? '' : `${year}-${String((value % 12) + 1).padStart(2, '0')}`;
}
export function previousPeriod(range: MonthRange): MonthRange {
  const length = periodMonths(range.from, range.through).length;
  return { from: shiftMonth(range.from, -length), through: shiftMonth(range.from, -1) };
}
export function periodSummary(runs: readonly Run[], range: MonthRange, filter: RunFilter = {}) {
  const selected = selectPeriod(filterRuns(runs, filter), { mode: 'range', ...range });
  const summary = summarize(selected.runs);
  return {
    ...summary,
    months: selected.months.length,
    runningDays: new Set(selected.runs.map((run) => dateKey(run.startTime))).size,
    distancePerMonthMeters: selected.months.length
      ? summary.distanceMeters / selected.months.length
      : 0,
  };
}
export function comparePeriods(
  runs: readonly Run[],
  a: MonthRange,
  b: MonthRange,
  filter: RunFilter = {},
) {
  const left = periodSummary(runs, a, filter),
    right = periodSummary(runs, b, filter);
  return {
    a: left,
    b: right,
    valid: Boolean(left.months && right.months),
    overlap: a.from <= b.through && b.from <= a.through,
    distancePercent:
      left.distanceMeters > 0
        ? ((right.distanceMeters - left.distanceMeters) / left.distanceMeters) * 100
        : null,
    paceDifference:
      left.paceSecondsPerKm === null || right.paceSecondsPerKm === null
        ? null
        : right.paceSecondsPerKm - left.paceSecondsPerKm,
    heartDifference:
      left.averageHeartRateBpm === null || right.averageHeartRateBpm === null
        ? null
        : right.averageHeartRateBpm - left.averageHeartRateBpm,
  };
}
