import { syntheticRun } from './run';
import { DEFAULT_GOALS } from '../../../src/domain/models/goals';
import type { BackupSnapshot } from '../../../src/infrastructure/backup/format';
export function syntheticBackup(): BackupSnapshot {
  const run = syntheticRun({
    id: 'a'.repeat(64),
    details: {
      averageCadenceSpm: 180,
      cadenceOrigin: 'statistics',
      routeFiles: ['/workout-routes/synthetic.gpx'],
    },
  });
  return {
    format: 'my-running-coach-backup',
    version: 1,
    timeZone: 'Asia/Tokyo',
    exportedAt: '2026-10-25T00:00:00.000Z',
    runs: [run],
    routes: [
      {
        id: run.id,
        segments: [
          [
            [0, 0],
            [0.01, 0.02],
          ],
        ],
        pointCount: 2,
        sampled: false,
      },
    ],
    goals: { ...DEFAULT_GOALS, monthlyDistanceKm: 50, weeklyRunCount: 3, annualDistanceKm: 600 },
  };
}
