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
  details?: RunDetails;
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

export interface RunDetails {
  averageCadenceSpm?: number;
  cadenceOrigin?: 'statistics' | 'steps-duration';
  totalSteps?: number;
  activeEnergyKcal?: number;
  averagePowerWatts?: number;
  averageStrideLengthMeters?: number;
  averageGroundContactMilliseconds?: number;
  averageVerticalOscillationCentimeters?: number;
  maximumHeartRateBpm?: number;
  elevationAscendedMeters?: number;
  indoor?: boolean;
  workoutName?: string;
  routeFiles?: string[];
}
export interface RunRoute {
  id: string;
  segments: [number, number][][];
  pointCount: number;
  sampled: boolean;
  incomplete?: boolean;
}
