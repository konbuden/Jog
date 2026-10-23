export interface Run {
  id: string;
  source: 'apple-health';
  sourceId: string;
  sourceName: string;
  device: string;
  startTime: string;
  endTime: string;
  startOffsetMinutes: number;
  distanceMeters: number;
  durationSeconds: number;
  averageHeartRateBpm: number | null;
  paceSecondsPerKm: number;
  distanceOrigin: 'workout' | 'statistics';
  heartRateOrigin: 'workout-statistics' | null;
  importedAt: string;
}

export type RunCandidate = Omit<Run, 'importedAt'>;

export interface RunFilter {
  minDistanceKm?: number;
  maxDistanceKm?: number;
  from?: string;
  through?: string;
  minHeartRate?: number;
  maxHeartRate?: number;
  missingHeartRateOnly?: boolean;
}
