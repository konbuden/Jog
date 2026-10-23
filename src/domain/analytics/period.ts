import type { Run } from '../models/run';
import { monthKey } from './time';

export interface MonthSelection {
  mode: 'single' | 'range' | 'all';
  from: string;
  through: string;
}
export function validMonth(value: string) {
  return /^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value);
}
const ordinal = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
export function selectionBounds(selection: MonthSelection, runs: readonly Run[]) {
  if (selection.mode !== 'all')
    return {
      from: selection.from,
      through: selection.mode === 'single' ? selection.from : selection.through,
    };
  const months = runs.map((run) => monthKey(run.startTime)).sort();
  return { from: months[0] ?? selection.from, through: months.at(-1) ?? selection.from };
}
export function periodMonths(from: string, through: string): string[] {
  if (!validMonth(from) || !validMonth(through) || from > through) return [];
  const count = ordinal(through) - ordinal(from) + 1;
  if (count > 1200) return [];
  return Array.from({ length: count }, (_, i) => {
    const value = ordinal(from) + i;
    return `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, '0')}`;
  });
}
export function selectPeriod(runs: readonly Run[], selection: MonthSelection) {
  const bounds = selectionBounds(selection, runs);
  const months = periodMonths(bounds.from, bounds.through);
  return {
    ...bounds,
    months,
    runs: months.length
      ? runs.filter((run) => {
          const month = monthKey(run.startTime);
          return month >= bounds.from && month <= bounds.through;
        })
      : [],
  };
}
