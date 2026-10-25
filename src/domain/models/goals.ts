export interface GoalSettings {
  id: 'goals';
  monthlyDistanceKm: number;
  weeklyRunCount: number | null;
  annualDistanceKm: number | null;
  updatedAt: string;
}
export const DEFAULT_GOALS: GoalSettings = {
  id: 'goals',
  monthlyDistanceKm: 100,
  weeklyRunCount: null,
  annualDistanceKm: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};
export function validateGoals(value: GoalSettings): string | null {
  const distance = (value: number, maximum: number) =>
    Number.isFinite(value) &&
    value >= 0.1 &&
    value <= maximum &&
    Math.abs(value * 10 - Math.round(value * 10)) < 1e-7;
  if (!distance(value.monthlyDistanceKm, 100_000))
    return '月間距離は0.1〜100000 kmを0.1 km刻みで入力してください。';
  if (
    value.weeklyRunCount !== null &&
    (!Number.isInteger(value.weeklyRunCount) ||
      value.weeklyRunCount < 1 ||
      value.weeklyRunCount > 100)
  )
    return '週間回数は1〜100回の整数、または空欄にしてください。';
  if (value.annualDistanceKm !== null && !distance(value.annualDistanceKm, 1_000_000))
    return '年間距離は0.1〜1000000 kmを0.1 km刻み、または空欄にしてください。';
  return null;
}
