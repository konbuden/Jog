import type { Run } from '../models/run';
import type { GoalSettings } from '../models/goals';
import { dateKey } from './time';
import { validMonth } from './period';
import { mondayOf, shiftDate } from './calendar';
export interface GoalBucket {
  key: string;
  from: string;
  through: string;
  actual: number;
  target: number;
  percent: number;
  achieved: boolean;
  partial: boolean;
  state: 'future' | 'open' | 'ended';
}
const rate = (actual: number, target: number) => (actual / target) * 100;
export function selectedGoalProgress(
  runs: readonly Run[],
  months: readonly string[],
  goals: GoalSettings,
  now = new Date(),
) {
  const today = dateKey(now.toISOString()),
    year = today.slice(0, 4),
    nowMs = now.getTime();
  const scope = Array.from(new Set(months.filter(validMonth))).sort(),
    scopeSet = new Set(scope);
  const monthDistances = new Map<string, number>(),
    weekCounts = new Map<string, number>();
  let annualMeters = 0,
    periodMeters = 0;
  for (const run of runs) {
    if (Date.parse(run.startTime) > nowMs) continue;
    const date = dateKey(run.startTime),
      month = date.slice(0, 7);
    if (date.startsWith(`${year}-`)) annualMeters += run.distanceMeters;
    if (!scopeSet.has(month)) continue;
    periodMeters += run.distanceMeters;
    monthDistances.set(month, (monthDistances.get(month) ?? 0) + run.distanceMeters);
    const week = mondayOf(date);
    weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
  }
  const monthly: GoalBucket[] = scope.map((month) => {
    const from = `${month}-01`,
      next = new Date(`${from}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(0);
    const through = next.toISOString().split('T')[0]!;
    const distance = (monthDistances.get(month) ?? 0) / 1000;
    return {
      key: month,
      from,
      through,
      actual: distance,
      target: goals.monthlyDistanceKm,
      percent: rate(distance, goals.monthlyDistanceKm),
      achieved: distance >= goals.monthlyDistanceKm,
      partial: false,
      state: from > today ? 'future' : through < today ? 'ended' : 'open',
    };
  });
  const weekly: GoalBucket[] = [];
  if (scope.length) {
    const first = monthly[0]!.from,
      last = monthly.at(-1)!.through;
    for (let start = mondayOf(first); start <= last; start = shiftDate(start, 7)) {
      const end = shiftDate(start, 6),
        from = start < first ? first : start,
        through = end > last ? last : end;
      const count = weekCounts.get(start) ?? 0;
      const target = goals.weeklyRunCount;
      weekly.push({
        key: start,
        from,
        through,
        actual: count,
        target: target ?? 0,
        percent: target === null ? 0 : rate(count, target),
        achieved: target !== null && count >= target,
        partial: from !== start || through !== end,
        state: from > today ? 'future' : through < today ? 'ended' : 'open',
      });
    }
  }
  const annualKm = annualMeters / 1000;
  return {
    today,
    year,
    monthly,
    weekly,
    monthlyAchieved: monthly.filter((month) => month.achieved).length,
    weeklyAchieved: weekly.filter((week) => week.achieved).length,
    partialWeeks: weekly.filter((week) => week.partial).length,
    periodKm: periodMeters / 1000,
    periodTargetKm: Math.round(scope.length * goals.monthlyDistanceKm * 10) / 10,
    annualKm,
    annualPercent: goals.annualDistanceKm === null ? null : rate(annualKm, goals.annualDistanceKm),
  };
}
