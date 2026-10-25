import type { Run } from '../models/run';
import { dateKey, monthKey } from './time';
import { validMonth } from './period';
import { summarize } from './running';
export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().split('T')[0]!;
}
export function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}
export function calendarWeeks(month: string, runs: readonly Run[]) {
  if (!validMonth(month)) return [];
  const first = `${month}-01`,
    start = mondayOf(first);
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(next.getUTCDate() - 1);
  const last = next.toISOString().split('T')[0]!;
  const days =
    Math.round(
      (new Date(`${last}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) /
        86400000,
    ) + 1;
  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    const date = dateKey(run.startTime);
    const group = groups.get(date) ?? [];
    group.push(run);
    groups.set(date, group);
  }
  return Array.from({ length: Math.ceil(days / 7) }, (_, week) => {
    const dates = Array.from({ length: 7 }, (_, i) => {
      const date = shiftDate(start, week * 7 + i);
      return {
        date,
        inMonth: date.slice(0, 7) === month,
        runs: groups.get(date) ?? [],
        ...summarize(groups.get(date) ?? []),
      };
    });
    return {
      start: dates[0]!.date,
      end: dates[6]!.date,
      dates,
      ...summarize(dates.flatMap((day) => day.runs)),
    };
  });
}
export function currentGoalProgress(runs: readonly Run[], now = new Date()) {
  const today = dateKey(now.toISOString()),
    weekStart = mondayOf(today),
    weekEnd = shiftDate(weekStart, 6),
    month = monthKey(now),
    year = today.slice(0, 4);
  const weekly = runs.filter((run) => {
    const date = dateKey(run.startTime);
    return date >= weekStart && date <= weekEnd;
  });
  return {
    today,
    weekStart,
    weekEnd,
    year,
    weekly: summarize(weekly),
    monthly: summarize(runs.filter((run) => monthKey(run.startTime) === month)),
    annual: summarize(runs.filter((run) => dateKey(run.startTime).startsWith(`${year}-`))),
  };
}
