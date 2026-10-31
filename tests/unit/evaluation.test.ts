import { expect, it } from 'vitest';
import { evaluateRun } from '../../src/domain/analytics/evaluation';
import { parseLaps, lapsText, validateReview } from '../../src/domain/analytics/review';
import { emptyReview } from '../../src/domain/models/review';
import { reviewedRun, syntheticReview } from '../fixtures/synthetic/review';
import { syntheticRun } from '../fixtures/synthetic/run';
it('過去の全記録より遅く心拍が高い完走でも順位0点を付けない', () => {
  const run = reviewedRun(),
    review = syntheticReview();
  const past = [1, 2, 3].map((day) => ({
    ...run,
    id: `ref-${day}`,
    startTime: `2026-10-0${day}T01:00:00.000Z`,
    endTime: `2026-10-0${day}T01:50:00.000Z`,
    durationSeconds: 3000,
    paceSecondsPerKm: 300,
    averageHeartRateBpm: 120,
  }));
  const report = evaluateRun(run, past, review);
  expect(report.score).toBe(90);
  expect(report.available).toBe(3);
  expect(report.axes.map((axis) => axis.score)).toEqual([100, 100, (100 * 6) / 9]);
});
it('10km未満・心拍欠損・比較不足を0点にせず、既知の事実を記述する', () => {
  const run = syntheticRun({ averageHeartRateBpm: null });
  const report = evaluateRun(run, []);
  expect(report.score).toBeNull();
  expect(report.available).toBe(0);
  expect(report.equivalent10KmSeconds).toBe(3600);
  expect(report.axes[0]!.assessment).toContain('判定保留');
  expect(report.summary).toContain('等速換算');
  expect(report.recovery).toContain('判定保留');
});
it('10km完走だけでは総合採点せず、過去の完走日数と最長距離を確認する', () => {
  const run = reviewedRun(),
    past = [1, 2].map((day) => ({
      ...run,
      id: `r${day}`,
      startTime: `2026-10-0${day}T01:00:00.000Z`,
    }));
  const report = evaluateRun(run, past);
  expect(report.score).toBeNull();
  expect(report.available).toBe(1);
  expect(report.tenKmDays).toBe(3);
  expect(report.axes[0]!.assessment).toContain('継続');
});
it('意図的な終盤減速と心拍上昇を両方説明し、失速や余力を推定しない', () => {
  const run = { ...reviewedRun(), durationSeconds: 3720, paceSecondsPerKm: 372 },
    review = syntheticReview();
  review.lateIntent = 'ease';
  review.laps = review.laps.map((lap, index) => ({
    ...lap,
    durationSeconds: index >= 8 ? 420 : 360,
    averageHeartRateBpm: index >= 8 ? 150 : 132,
  }));
  const report = evaluateRun(run, [], review);
  expect(report.axes[1]!.score).toBe(100);
  expect(report.good.join()).toContain('意図的');
  expect(report.improvements.join()).toContain('心肺への負荷が十分に下がったとは言い切れません');
  expect(report.observations.join()).toContain('132→終盤150');
});
it('終盤加速は中盤の安定性と分け、パワーの変化を示す', () => {
  const run = { ...reviewedRun(), durationSeconds: 3480, paceSecondsPerKm: 348 },
    review = syntheticReview();
  review.lateIntent = 'push';
  review.laps = review.laps.map((lap, index) => ({
    ...lap,
    durationSeconds: index >= 8 ? 300 : 360,
    averagePowerWatts: index >= 8 ? 240 : 200,
  }));
  const report = evaluateRun(run, [], review);
  expect(report.axes[1]!.score).toBe(100);
  expect(report.observations.join()).toContain('20.0%');
  expect(report.good.join()).toContain('終盤の加速');
});
it('意図不明・ラップ不明の場合は失速や余力の根拠にしない', () => {
  const report = evaluateRun(reviewedRun(), []);
  expect(report.axes[1]!.score).toBeNull();
  expect(report.axes[2]!.score).toBeNull();
  expect(report.summary).toContain('意図は未確認');
  expect(report.improvements.join()).toContain('余力を判断できません');
});
it('インターバルは一定ペースの採点対象外とする', () => {
  const review = { ...syntheticReview(), purpose: 'interval' as const };
  expect(evaluateRun(reviewedRun(), [], review).axes[1]!.score).toBeNull();
  expect(evaluateRun(reviewedRun(), [], review).score).toBeNull();
});
it('区間時間ではなく距離で加重し、中盤区間だけからCVを計算する', () => {
  const run = reviewedRun(),
    review = syntheticReview();
  review.laps = [
    {
      distanceMeters: 2000,
      durationSeconds: 720,
      averageHeartRateBpm: null,
      averagePowerWatts: null,
    },
    {
      distanceMeters: 1000,
      durationSeconds: 300,
      averageHeartRateBpm: null,
      averagePowerWatts: null,
    },
    {
      distanceMeters: 3000,
      durationSeconds: 1260,
      averageHeartRateBpm: null,
      averagePowerWatts: null,
    },
    {
      distanceMeters: 2000,
      durationSeconds: 600,
      averageHeartRateBpm: null,
      averagePowerWatts: null,
    },
    {
      distanceMeters: 2000,
      durationSeconds: 720,
      averageHeartRateBpm: null,
      averagePowerWatts: null,
    },
  ];
  const report = evaluateRun(run, [], review);
  expect(report.axes[1]!.score).toBeCloseTo(100 / (1 + (10 * Math.sqrt(3600)) / 360));
  expect(report.observations.join()).not.toContain('区間平均心拍');
});
it('RPEと余裕の申告不一致・違和感があれば余力点を保留する', () => {
  const review = syntheticReview();
  expect(
    evaluateRun(reviewedRun(), [], { ...review, rpe: 9, extraDistance: 'yes' }).axes[2]!.score,
  ).toBeNull();
  expect(
    evaluateRun(reviewedRun(), [], { ...review, rpe: 2, extraDistance: 'no' }).axes[2]!.score,
  ).toBeNull();
  expect(evaluateRun(reviewedRun(), [], { ...review, discomfort: 'present' }).score).toBeNull();
});
it('RPEの尺度の端点と翌日の本人申告を扱い、回復力向上とは断定しない', () => {
  const review = syntheticReview();
  expect(evaluateRun(reviewedRun(), [], { ...review, rpe: 1 }).axes[2]!.score).toBe(100);
  expect(
    evaluateRun(reviewedRun(), [], { ...review, rpe: 10, extraDistance: 'no' }).axes[2]!.score,
  ).toBe(0);
  expect(evaluateRun(reviewedRun(), [], { ...review, nextDay: 'normal' }).recovery).toContain(
    '今回1回だけで回復力向上とは断定しません',
  );
  expect(evaluateRun(reviewedRun(), [], { ...review, nextDay: 'tired' }).advice.join()).toContain(
    '休養',
  );
});
it('速度向上と心拍上昇を同時に説明し、近い心拍での短縮は観測結果として示す', () => {
  const run = reviewedRun(),
    past = {
      ...run,
      id: 'prior',
      startTime: '2026-10-10T01:00:00.000Z',
      paceSecondsPerKm: 390,
      durationSeconds: 3900,
      averageHeartRateBpm: 120,
    };
  expect(evaluateRun(run, [past]).improvements.join()).toContain(
    '短縮のすべてを走力向上とは言い切れません',
  );
  expect(evaluateRun(run, [{ ...past, averageHeartRateBpm: 131 }]).good.join()).toContain(
    '近い平均心拍',
  );
});
it('比較には90日以内の別日の同記録元を使い、コピー・未来・別環境を除外する', () => {
  const run = reviewedRun(),
    ref = { ...run, id: 'past', startTime: '2026-10-01T01:00:00.000Z' },
    bad = [
      { ...ref, id: 'same', startTime: '2026-10-12T00:00:00.000Z' },
      { ...ref, id: 'future', startTime: '2026-10-13T00:00:00.000Z' },
      { ...ref, id: 'old', startTime: '2026-01-01T00:00:00.000Z' },
      { ...ref, id: 'other', sourceName: 'Other' },
      { ...ref, id: 'indoor', details: { indoor: true } },
    ];
  const report = evaluateRun({ ...run, details: { indoor: false } }, [
    ref,
    { ...ref, id: 'copy' },
    ...bad,
  ]);
  expect(report.referenceCount).toBe(1);
  expect(report.previous).toHaveLength(1);
});
it('月間助言は指定目標と対象時点の実績を使い、後日の記録を混ぜない', () => {
  const run = reviewedRun();
  const report = evaluateRun(
    run,
    [{ ...run, id: 'later', startTime: '2026-10-20T01:00:00.000Z' }],
    emptyReview(run.id),
    25,
  );
  expect(report.advice.join()).toContain('月間10.0km / 目標25km');
  expect(report.advice.join()).toContain('残り15.0km');
});
it('区間CSVを検証して往復でき、未入力心拍・パワーを補完しない', () => {
  const run = reviewedRun(),
    text = Array(10).fill('1, 6:00').join('\n'),
    laps = parseLaps(text, run);
  expect(laps[0]!.averageHeartRateBpm).toBeNull();
  expect(laps[0]!.averagePowerWatts).toBeNull();
  expect(parseLaps(lapsText(laps), run)).toEqual(laps);
  expect(parseLaps('', run)).toEqual([]);
});
it.each([
  '1, 6:99',
  '1, 6:00, 999',
  'NaN, 6:00',
  '-1, 6:00',
  '1, 0:00',
  '1, 6:00, 130, Infinity',
  '1, 6:00, 130, 200, 0',
  Array(101).fill('1, 6:00').join('\n'),
])('不正な区間値を拒否する: %s', (text) => {
  expect(() => parseLaps(text, reviewedRun())).toThrow();
});
it('部分区間や合計時間不一致を全走行として分析しない', () => {
  expect(() => parseLaps('1, 6:00', reviewedRun())).toThrow('距離');
  expect(() => parseLaps('10, 10:00', reviewedRun())).toThrow('時間');
  expect(() =>
    evaluateRun(reviewedRun(), [], {
      ...syntheticReview(),
      laps: syntheticReview().laps.slice(0, 3),
    }),
  ).toThrow();
});
it('不正なRPEや別ランの振り返りを拒否し、入力を変更しない', () => {
  expect(validateReview({ ...syntheticReview(), rpe: 11 }, reviewedRun())).not.toBeNull();
  expect(() => evaluateRun(syntheticRun(), [], syntheticReview())).toThrow();
  const run = reviewedRun(),
    review = syntheticReview(),
    snapshot = JSON.stringify(review);
  expect(evaluateRun(run, [], review)).toEqual(evaluateRun(run, [], review));
  expect(JSON.stringify(review)).toBe(snapshot);
});
