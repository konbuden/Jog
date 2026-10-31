import { syntheticRun } from './run';
import { emptyReview, type RunReview } from '../../../src/domain/models/review';
export const reviewedRun = () =>
  syntheticRun({
    id: 'c'.repeat(64),
    sourceId: 'synthetic-review-run',
    startTime: '2026-10-12T01:00:00.000Z',
    endTime: '2026-10-12T02:00:00.000Z',
    distanceMeters: 10000,
    durationSeconds: 3600,
    paceSecondsPerKm: 360,
    averageHeartRateBpm: 132,
  });
export const syntheticReview = (): RunReview => ({
  ...emptyReview(reviewedRun().id),
  purpose: 'steady' as const,
  rpe: 4,
  lateIntent: 'steady' as const,
  extraDistance: 'yes' as const,
  discomfort: 'none' as const,
  updatedAt: '2026-10-12T03:00:00.000Z',
  revision: 'synthetic-review-revision',
  laps: Array.from({ length: 10 }, () => ({
    distanceMeters: 1000,
    durationSeconds: 360,
    averageHeartRateBpm: 132,
    averagePowerWatts: 200,
  })),
});
