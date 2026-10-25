import type { Run, RunDetails, RunRoute } from '../../domain/models/run';
import type { GoalSettings } from '../../domain/models/goals';
import { validateGoals } from '../../domain/models/goals';
import { parseHealthDate } from '../../domain/analytics/time';
import { calculatePace } from '../../domain/analytics/running';
export const BACKUP_LIMITS = { bytes: 200_000_000, runs: 100_000, routes: 10_000 };
export interface BackupSnapshot {
  format: 'my-running-coach-backup';
  version: 1;
  timeZone: 'Asia/Tokyo';
  exportedAt: string;
  runs: Run[];
  routes: RunRoute[];
  goals: GoalSettings;
}
const bad = () =>
  new Error(
    'バックアップの形式・値・参照情報が不正です。元のバックアップファイルを選択してください。',
  );
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 262144): string {
  if (typeof value !== 'string' || value.length > max) throw bad();
  return value;
}
function finite(value: unknown, min = 0, max = Number.MAX_VALUE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw bad();
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  const result = finite(value, min, max);
  if (!Number.isInteger(result)) throw bad();
  return result;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw bad();
  return value;
}
function iso(value: unknown): string {
  const result = text(value, 32);
  if (parseHealthDate(result)?.iso !== result) throw bad();
  return result;
}
function id(value: unknown): string {
  const result = text(value, 64);
  if (!/^[a-f0-9]{64}$/.test(result)) throw bad();
  return result;
}
const numericDetails = [
  'averageCadenceSpm',
  'totalSteps',
  'activeEnergyKcal',
  'averagePowerWatts',
  'averageStrideLengthMeters',
  'averageGroundContactMilliseconds',
  'averageVerticalOscillationCentimeters',
  'maximumHeartRateBpm',
  'elevationAscendedMeters',
] as const;
function parseDetails(value: unknown): RunDetails {
  const input = record(value),
    result: RunDetails = {};
  for (const key of numericDetails) if (input[key] !== undefined) result[key] = finite(input[key]);
  if (input.cadenceOrigin !== undefined) {
    if (input.cadenceOrigin !== 'statistics' && input.cadenceOrigin !== 'steps-duration')
      throw bad();
    result.cadenceOrigin = input.cadenceOrigin;
  }
  if (input.indoor !== undefined) result.indoor = bool(input.indoor);
  if (input.workoutName !== undefined) result.workoutName = text(input.workoutName, 200);
  if (input.routeFiles !== undefined) {
    if (!Array.isArray(input.routeFiles) || input.routeFiles.length > 8) throw bad();
    result.routeFiles = input.routeFiles.map((value) => text(value));
  }
  return result;
}
function parseRun(value: unknown): Run {
  const run = record(value);
  if (
    run.source !== 'apple-health' ||
    (run.distanceOrigin !== 'workout' && run.distanceOrigin !== 'statistics')
  )
    throw bad();
  const start = iso(run.startTime),
    end = iso(run.endTime);
  if (end < start) throw bad();
  const distance = finite(run.distanceMeters, Number.MIN_VALUE),
    duration = finite(run.durationSeconds, Number.MIN_VALUE),
    pace = finite(run.paceSecondsPerKm, Number.MIN_VALUE),
    expected = calculatePace(distance, duration);
  if (
    expected === null ||
    !Number.isFinite(expected) ||
    Math.abs(expected - pace) > Math.max(1, expected) * 1e-9
  )
    throw bad();
  const heart =
    run.averageHeartRateBpm === null ? null : finite(run.averageHeartRateBpm, Number.MIN_VALUE);
  if (run.heartRateOrigin !== (heart === null ? null : 'workout-statistics')) throw bad();
  const result: Run = {
    id: id(run.id),
    source: 'apple-health',
    sourceId: text(run.sourceId, 1_000_000),
    sourceName: text(run.sourceName),
    device: text(run.device),
    startTime: start,
    endTime: end,
    startOffsetMinutes: integer(run.startOffsetMinutes, -840, 840),
    distanceMeters: distance,
    durationSeconds: duration,
    averageHeartRateBpm: heart,
    paceSecondsPerKm: pace,
    distanceOrigin: run.distanceOrigin as Run['distanceOrigin'],
    heartRateOrigin: heart === null ? null : 'workout-statistics',
    importedAt: iso(run.importedAt),
  };
  if (run.details !== undefined) result.details = parseDetails(run.details);
  return result;
}
function parseRoute(value: unknown): RunRoute {
  const route = record(value);
  if (!Array.isArray(route.segments) || !route.segments.length || route.segments.length > 64)
    throw bad();
  let count = 0;
  const segments = route.segments.map((segment) => {
    if (!Array.isArray(segment) || !segment.length || segment.length > 4096) throw bad();
    count += segment.length;
    if (count > 4096) throw bad();
    return segment.map((point) => {
      if (!Array.isArray(point) || point.length !== 2) throw bad();
      return [finite(point[0], -90, 90), finite(point[1], -180, 180)] as [number, number];
    });
  });
  const result: RunRoute = {
    id: id(route.id),
    segments,
    pointCount: integer(route.pointCount, count, Number.MAX_SAFE_INTEGER),
    sampled: bool(route.sampled),
  };
  if (route.incomplete !== undefined) result.incomplete = bool(route.incomplete);
  return result;
}
export function parseGoalSettings(value: unknown): GoalSettings {
  const goal = record(value);
  if (goal.id !== 'goals') throw bad();
  const result: GoalSettings = {
    id: 'goals',
    monthlyDistanceKm: finite(goal.monthlyDistanceKm),
    weeklyRunCount: goal.weeklyRunCount === null ? null : finite(goal.weeklyRunCount),
    annualDistanceKm: goal.annualDistanceKm === null ? null : finite(goal.annualDistanceKm),
    updatedAt: iso(goal.updatedAt),
  };
  const error = validateGoals(result);
  if (error) throw new Error(error);
  return result;
}
export function validateSnapshot(value: unknown): BackupSnapshot {
  const input = record(value);
  if (input.format !== 'my-running-coach-backup')
    throw new Error('My Running CoachのバックアップJSONを選択してください。');
  if (input.version !== 1)
    throw new Error('このバックアップ形式のバージョンには対応していません。');
  if (input.timeZone !== 'Asia/Tokyo' || !Array.isArray(input.runs) || !Array.isArray(input.routes))
    throw bad();
  if (input.runs.length > BACKUP_LIMITS.runs || input.routes.length > BACKUP_LIMITS.routes)
    throw new Error('バックアップの記録数・コース数が上限を超えています。');
  const runs = input.runs.map(parseRun),
    routes = input.routes.map(parseRoute),
    runIds = new Set(runs.map((run) => run.id));
  if (
    runIds.size !== runs.length ||
    new Set(routes.map((route) => route.id)).size !== routes.length ||
    routes.some((route) => !runIds.has(route.id))
  )
    throw bad();
  return {
    format: 'my-running-coach-backup',
    version: 1,
    timeZone: 'Asia/Tokyo',
    exportedAt: iso(input.exportedAt),
    runs,
    routes,
    goals: parseGoalSettings(input.goals),
  };
}
export async function readBackup(file: Blob): Promise<BackupSnapshot> {
  if (file.size > BACKUP_LIMITS.bytes) throw new Error('バックアップは200 MBまで対応しています。');
  if (!file.size) throw new Error('バックアップファイルが空です。');
  let value: unknown;
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    value = JSON.parse(content);
  } catch {
    throw new Error('バックアップJSONを読み込めません。ファイルの形式・破損を確認してください。');
  }
  return validateSnapshot(value);
}
