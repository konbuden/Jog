import { describe, expect, it } from 'vitest';
import {
  calculatePace,
  equivalent10Km,
  filterRuns,
  monthlySummary,
  summarize,
} from '../../src/domain/analytics/running';
import { monthKey, parseHealthDate, recentMonths } from '../../src/domain/analytics/time';
import { syntheticRun } from '../fixtures/synthetic/run';

describe('計算と集計', () => {
  it('距離と時間からペースと10km等速換算を計算する', () => {
    expect(calculatePace(5000, 1800)).toBe(360);
    expect(equivalent10Km(5000, 1800)).toBe(3600);
    expect(calculatePace(0, 100)).toBeNull();
    expect(calculatePace(100, NaN)).toBeNull();
    expect(equivalent10Km(100, -1)).toBeNull();
  });
  it('日本時間の月境界で距離を集計する', () => {
    const runs = [
      syntheticRun({ startTime: '2026-09-30T14:59:59Z' }),
      syntheticRun({ id: 'b', startTime: '2026-09-30T15:00:00Z' }),
    ];
    expect(
      monthlySummary(runs, ['2026-09', '2026-10', '2026-11']).map((m) => m.distanceMeters),
    ).toEqual([5000, 5000, 0]);
    expect(monthKey('2026-12-31T15:00:00Z')).toBe('2027-01');
    expect(recentMonths(new Date('2026-01-01T01:00:00Z'), 3)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
  });
  it('平均ペースは総時間/総距離、心拍は取得済みの時間加重平均', () => {
    const result = summarize([
      syntheticRun(),
      syntheticRun({ distanceMeters: 10000, durationSeconds: 3000, averageHeartRateBpm: null }),
    ]);
    expect(result.paceSecondsPerKm).toBe(320);
    expect(result.averageHeartRateBpm).toBe(135);
    expect(result.heartRateCount).toBe(1);
    expect(summarize([]).paceSecondsPerKm).toBeNull();
    expect(summarize([]).averageHeartRateBpm).toBeNull();
  });
  it('心拍130台は130以上140未満でnullを含めない', () => {
    const runs = [129, 130, 139.9, 140, null].map((averageHeartRateBpm) =>
      syntheticRun({ averageHeartRateBpm }),
    );
    expect(
      filterRuns(runs, { minHeartRate: 130, maxHeartRate: 140 }).map((r) => r.averageHeartRateBpm),
    ).toEqual([130, 139.9]);
    expect(filterRuns(runs, { missingHeartRateOnly: true })).toHaveLength(1);
  });
  it('距離・日付・心拍のAND条件と終了日を適用する', () => {
    const runs = [
      syntheticRun(),
      syntheticRun({ distanceMeters: 10000 }),
      syntheticRun({ startTime: '2026-10-01T15:00:00Z' }),
    ];
    expect(
      filterRuns(runs, {
        minDistanceKm: 5,
        maxDistanceKm: 10,
        from: '2026-10-01',
        through: '2026-10-01',
        minHeartRate: 130,
      }),
    ).toHaveLength(1);
  });
});

describe('日時解析', () => {
  it('明示的なオフセットをUTCへ正規化する', () => {
    expect(parseHealthDate('2026-10-01 10:00:00 +0900')).toEqual({
      iso: '2026-10-01T01:00:00.000Z',
      offsetMinutes: 540,
    });
    expect(parseHealthDate('2026-10-01T10:00:00-04:00')?.iso).toBe('2026-10-01T14:00:00.000Z');
  });
  it.each([
    '2026-02-30 10:00:00 +0900',
    '2026-10-01 10:00:00',
    '2026-10-01 25:00:00 +0900',
    '2026-10-01 10:00:00 +1499',
  ])('不正日時を拒否: %s', (value) => {
    expect(parseHealthDate(value)).toBeNull();
  });
});
