import type { ParseReport } from '../infrastructure/apple-health/parser';

export interface ImportPreview extends ParseReport {
  newCount: number;
  duplicates: number;
  conflicts: number;
  firstTime: string | null;
  lastTime: string | null;
}
export type ImportRequest =
  { type: 'start'; file: File } | { type: 'confirm' } | { type: 'cancel' };
export type ImportResponse =
  | { type: 'progress'; percent: number }
  | { type: 'preview'; preview: ImportPreview }
  | { type: 'complete'; added: number; duplicates: number; conflicts: number }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };
