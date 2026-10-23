import type { Run } from '../../../src/domain/models/run';

export function syntheticRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'synthetic-1',
    source: 'apple-health',
    sourceId: 'synthetic-1',
    sourceName: 'Synthetic Watch',
    device: '',
    startTime: '2026-10-01T01:00:00.000Z',
    endTime: '2026-10-01T01:30:00.000Z',
    startOffsetMinutes: 540,
    distanceMeters: 5000,
    durationSeconds: 1800,
    averageHeartRateBpm: 135,
    paceSecondsPerKm: 360,
    distanceOrigin: 'workout',
    heartRateOrigin: 'workout-statistics',
    importedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  };
}
