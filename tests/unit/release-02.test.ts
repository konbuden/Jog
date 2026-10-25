import { expect, it } from 'vitest';
import { calendarWeeks, mondayOf, currentGoalProgress } from '../../src/domain/analytics/calendar';
import { comparePeriods, previousPeriod, shiftMonth } from '../../src/domain/analytics/comparison';
import { DEFAULT_GOALS, validateGoals } from '../../src/domain/models/goals';
import { syntheticRun } from '../fixtures/synthetic/run';
it('うるう年のカレンダーを月曜始まりにし、日本時間の複数ランと空日を集計する', () => {
  const runs = [
    syntheticRun({ startTime: '2024-02-28T15:00:00.000Z' }),
    syntheticRun({ id: 'b', startTime: '2024-02-29T14:59:59.000Z' }),
  ];
  const weeks = calendarWeeks('2024-02', runs);
  expect(weeks[0]?.start).toBe('2024-01-29');
  expect(weeks.at(-1)?.end).toBe('2024-03-03');
  const leap = weeks.flatMap((week) => week.dates).find((day) => day.date === '2024-02-29');
  expect(leap?.count).toBe(2);
  expect(leap?.distanceMeters).toBe(10000);
  expect(weeks[0]?.count).toBe(0);
  expect(mondayOf('2027-01-01')).toBe('2026-12-28');
  expect(calendarWeeks('2024-13', [])).toEqual([]);
});
it('今週・今月・今年の進捗は日本時間の境界で判定する', () => {
  const runs = [
    syntheticRun({ startTime: '2026-12-31T14:59:59Z' }),
    syntheticRun({ id: 'b', startTime: '2026-12-31T15:00:00Z' }),
  ];
  const result = currentGoalProgress(runs, new Date('2026-12-31T15:00:00Z'));
  expect(result.year).toBe('2027');
  expect(result.annual.count).toBe(1);
  expect(result.monthly.count).toBe(1);
  expect(result.weekly.count).toBe(2);
  expect(result.weekStart).toBe('2026-12-28');
});
it('比較の平均は距離・時間で加重し、心拍欠損を0にしない', () => {
  const runs = [
    syntheticRun({ startTime: '2026-09-01T00:00:00Z' }),
    syntheticRun({
      id: 'b',
      startTime: '2026-10-01T00:00:00Z',
      distanceMeters: 10000,
      durationSeconds: 3000,
      paceSecondsPerKm: 300,
      averageHeartRateBpm: null,
    }),
  ];
  const result = comparePeriods(
    runs,
    { from: '2026-09', through: '2026-09' },
    { from: '2026-10', through: '2026-10' },
  );
  expect(result.paceDifference).toBe(-60);
  expect(result.distancePercent).toBe(100);
  expect(result.heartDifference).toBeNull();
  expect(result.b.heartRateCount).toBe(0);
  const filtered = comparePeriods(
    runs,
    { from: '2026-09', through: '2026-09' },
    { from: '2026-10', through: '2026-10' },
    { minHeartRate: 130, maxHeartRate: 140 },
  );
  expect(filtered.b.count).toBe(0);
  expect(filtered.b.paceSecondsPerKm).toBeNull();
});
it('比較期間の月数差・重複・逆転・基準0を扱う', () => {
  const result = comparePeriods(
    [],
    { from: '2026-09', through: '2026-10' },
    { from: '2026-10', through: '2026-10' },
  );
  expect(result.a.months).toBe(2);
  expect(result.overlap).toBe(true);
  expect(result.distancePercent).toBeNull();
  expect(result.paceDifference).toBeNull();
  expect(
    comparePeriods(
      [],
      { from: '2026-10', through: '2026-09' },
      { from: '2026-10', through: '2026-10' },
    ).valid,
  ).toBe(false);
  expect(previousPeriod({ from: '2026-01', through: '2026-03' })).toEqual({
    from: '2025-10',
    through: '2025-12',
  });
  expect(shiftMonth('1900-01', -1)).toBe('');
});
it('目標の正値・刻み・任意項目を検証する', () => {
  expect(validateGoals(DEFAULT_GOALS)).toBeNull();
  expect(
    validateGoals({
      ...DEFAULT_GOALS,
      monthlyDistanceKm: 50.5,
      weeklyRunCount: 3,
      annualDistanceKm: 600,
    }),
  ).toBeNull();
  for (const value of [0, -1, NaN, Infinity, 0.15, 100001])
    expect(validateGoals({ ...DEFAULT_GOALS, monthlyDistanceKm: value })).not.toBeNull();
  for (const value of [0, 1.5, 101])
    expect(validateGoals({ ...DEFAULT_GOALS, weeklyRunCount: value })).not.toBeNull();
  expect(validateGoals({ ...DEFAULT_GOALS, annualDistanceKm: -1 })).not.toBeNull();
});
