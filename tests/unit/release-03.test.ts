import { describe, expect, it } from 'vitest';
import { selectedGoalProgress } from '../../src/domain/analytics/goals';
import { DEFAULT_GOALS } from '../../src/domain/models/goals';
import { syntheticRun } from '../fixtures/synthetic/run';
const now = new Date('2026-10-31T01:00:00Z');
const goals = { ...DEFAULT_GOALS, monthlyDistanceKm: 10, weeklyRunCount: 2, annualDistanceKm: 100 };
describe('選択期間の目標', () => {
  it('月・週は選択期間、年は今年の全実績から計算し、空月も分母に含める', () => {
    const runs = [
      syntheticRun(),
      syntheticRun({ id: 'b', startTime: '2026-10-03T01:00:00Z' }),
      syntheticRun({ id: 'past', startTime: '2025-09-01T01:00:00Z' }),
      syntheticRun({ id: 'jan', startTime: '2026-01-01T01:00:00Z' }),
      syntheticRun({ id: 'future', startTime: '2026-12-01T01:00:00Z' }),
    ];
    const result = selectedGoalProgress(runs, ['2026-09', '2026-10'], goals, now);
    expect(result.monthlyAchieved).toBe(1);
    expect(result.monthly.map((item) => item.actual)).toEqual([0, 10]);
    expect(result.periodTargetKm).toBe(20);
    expect(result.weeklyAchieved).toBe(1);
    expect(result.annualKm).toBe(15);
    expect(result.annualPercent).toBe(15);
    expect(selectedGoalProgress(runs, ['2025-09'], goals, now).annualKm).toBe(15);
  });
  it('月境界の部分週で期間外の実績を数えず、月跨ぎ週を1週とする', () => {
    const runs = [
      syntheticRun({ startTime: '2026-09-30T14:59:59Z' }),
      syntheticRun({ id: 'b', startTime: '2026-09-30T15:00:00Z' }),
    ];
    const oct = selectedGoalProgress(runs, ['2026-10'], goals, now);
    expect(oct.weekly[0]).toMatchObject({
      from: '2026-10-01',
      through: '2026-10-04',
      partial: true,
      actual: 1,
      achieved: false,
    });
    const both = selectedGoalProgress(runs, ['2026-09', '2026-10'], goals, now);
    expect(both.weekly.find((week) => week.key === '2026-09-28')).toMatchObject({
      actual: 2,
      partial: false,
      achieved: true,
    });
  });
  it('日本時間の年境界・うるう月・未来・任意目標未設定を扱う', () => {
    const runs = [
      syntheticRun({ startTime: '2026-12-31T14:59:59Z' }),
      syntheticRun({ id: 'b', startTime: '2026-12-31T15:00:00Z' }),
    ];
    const result = selectedGoalProgress(
      runs,
      ['2024-02', '2027-02'],
      DEFAULT_GOALS,
      new Date('2026-12-31T15:00:00Z'),
    );
    expect(result.year).toBe('2027');
    expect(result.annualKm).toBe(5);
    expect(result.annualPercent).toBeNull();
    expect(result.weeklyAchieved).toBe(0);
    expect(result.monthly[0]!.through).toBe('2024-02-29');
    expect(result.monthly[1]!.state).toBe('future');
  });
  it('超過達成率を100%に丸めず、空期間は0対象とする', () => {
    expect(
      selectedGoalProgress([syntheticRun({ distanceMeters: 25000 })], ['2026-10'], goals, now)
        .monthly[0]!.percent,
    ).toBe(250);
    expect(selectedGoalProgress([], [], goals, now)).toMatchObject({
      monthly: [],
      weekly: [],
      periodKm: 0,
      periodTargetKm: 0,
    });
  });
});
