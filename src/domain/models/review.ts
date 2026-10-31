export interface RunLap {
  distanceMeters: number;
  durationSeconds: number;
  averageHeartRateBpm: number | null;
  averagePowerWatts: number | null;
}
export interface RunReview {
  id: string;
  purpose: 'unknown' | 'easy' | 'steady' | 'progressive' | 'interval';
  rpe: number | null;
  lateIntent: 'unknown' | 'ease' | 'push' | 'steady';
  extraDistance: 'unknown' | 'yes' | 'no';
  nextDay: 'unknown' | 'normal' | 'tired';
  discomfort: 'unknown' | 'none' | 'present';
  laps: RunLap[];
  updatedAt: string;
  revision: string;
}
export const emptyReview = (id: string): RunReview => ({
  id,
  purpose: 'unknown',
  rpe: null,
  lateIntent: 'unknown',
  extraDistance: 'unknown',
  nextDay: 'unknown',
  discomfort: 'unknown',
  laps: [],
  updatedAt: '',
  revision: '',
});
