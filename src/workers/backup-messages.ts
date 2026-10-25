import type { GoalSettings } from '../domain/models/goals';
import type { RestorePreview } from '../infrastructure/backup/service';
export type BackupRequest =
  | { type: 'export' }
  | { type: 'restore'; file: File }
  | { type: 'confirm'; restoreGoals: boolean }
  | { type: 'cancel' };
export type BackupResponse =
  | { type: 'exported'; blob: Blob; runCount: number; routeCount: number; exportedAt: string }
  | { type: 'preview'; preview: RestorePreview; goals: GoalSettings }
  | {
      type: 'complete';
      added: number;
      duplicates: number;
      updated: number;
      conflicts: number;
      routesAdded: number;
      goalsRestored: boolean;
    }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };
