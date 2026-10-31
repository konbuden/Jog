import { describe, expect, it } from 'vitest';
import { selectedGoalProgress } from '../../src/domain/analytics/goals';
import { evaluateRun } from '../../src/domain/analytics/evaluation';
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
const target = syntheticRun({ id: 'target', startTime: '2026-10-20T01:00:00Z' });
const refs = (pace = 360, heart: number | null = 135) =>
  [1, 2, 3].map((day) =>
    syntheticRun({
      id: `ref-${day}`,
      startTime: `2026-10-0${day}T01:00:00Z`,
      paceSecondsPerKm: pace,
      durationSeconds: pace * 5,
      averageHeartRateBpm: heart,
    }),
  );
describe('ブラウザ内の自己比較', () => {
  it.each([
    [370, 140, 100],
    [360, 135, 50],
    [350, 130, 0],
  ])('比較ペース%s・心拍%sで総合%s点になる', (pace, heart, expected) => {
    const report = evaluateRun(target, refs(pace, heart));
    expect(report.score).toBe(expected);
    expect(report.components.map((item) => item.count)).toEqual([3, 3]);
  });
  it('1指標だけ比較可能なら、その指標のみで採点する', () => {
    const report = evaluateRun(target, refs(400, 135));
    expect(report.score).toBe(100);
    expect(report.components[1]!.score).toBeNull();
  });
  it('心拍欠損・件数不足で推定や0点補完をしない', () => {
    const missing = evaluateRun({ ...target, averageHeartRateBpm: null }, refs());
    expect(missing.score).toBeNull();
    expect(missing.components[0]!.target).toBe(360);
    expect(missing.components[0]!.count).toBe(0);
    expect(evaluateRun(target, refs(360, null)).score).toBeNull();
    expect(evaluateRun(target, refs().slice(0, 2)).score).toBeNull();
  });
  it('対象日・未来・90日超過・別距離帯・別記録元・異なる屋内外を除外する', () => {
    const bad = [
      syntheticRun({ id: 'same-day', startTime: '2026-10-20T00:00:00Z' }),
      syntheticRun({ id: 'future', startTime: '2026-10-21T01:00:00Z' }),
      syntheticRun({ id: 'old', startTime: '2026-07-01T01:00:00Z' }),
      ...refs().map((run) => ({ ...run, distanceMeters: 7000 })),
      ...refs().map((run) => ({ ...run, sourceName: 'Other' })),
      ...refs().map((run) => ({ ...run, details: { indoor: true } })),
    ];
    expect(evaluateRun({ ...target, details: { indoor: false } }, bad).referenceCount).toBe(0);
  });
  it('同一活動の別IDコピーを比較件数に水増しせず、端の許容値を含める', () => {
    const records = refs(361, 136);
    expect(
      evaluateRun(target, [...records, ...records.map((run) => ({ ...run, id: `copy-${run.id}` }))])
        .components[0]!.count,
    ).toBe(3);
    expect(evaluateRun(target, records).score).toBe(50);
    expect(
      evaluateRun(target, [...refs(361, 136).map((run) => ({ ...run, distanceMeters: 6000 }))])
        .score,
    ).toBe(50);
  });
  it('入力を変更せず、同じデータから同じ結果を返す', () => {
    const history = refs(),
      snapshot = JSON.stringify(history);
    expect(evaluateRun(target, history)).toEqual(evaluateRun(target, history));
    expect(JSON.stringify(history)).toBe(snapshot);
  });
});

it('項目ごとの端数を丸めず総合点を平均してから四捨五入する', () => {
  const history = refs().map((run, index) => ({
    ...run,
    paceSecondsPerKm: index === 0 ? 359 : 350,
  }));
  expect(evaluateRun(target, history).score).toBe(33);
});
