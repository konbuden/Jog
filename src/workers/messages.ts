import type { ParseReport } from '../infrastructure/apple-health/parser';

export interface ImportPreview extends ParseReport {
  newCount: number;
  newFirstTime: string | null;
  newLastTime: string | null;
  fileAlreadyImported: boolean;
  enhancedCount: number;
  duplicates: number;
  conflicts: number;
  firstTime: string | null;
  lastTime: string | null;
}
export type ImportRequest =
  | { type: 'start'; file: File; includeExistingDetails?: boolean }
  | { type: 'confirm' }
  | { type: 'cancel' };
export type ImportResponse =
  | { type: 'progress'; percent: number; stage: 'fingerprint' | 'parsing' }
  | { type: 'preview'; preview: ImportPreview }
  | { type: 'complete'; added: number; duplicates: number; conflicts: number; updated: number }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };
