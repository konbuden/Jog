import { ImportError } from './errors';
import { SaxesParser } from 'saxes';
import { calculatePace } from '../../domain/analytics/running';
import { parseHealthDate } from '../../domain/analytics/time';
import type { RunCandidate } from '../../domain/models/run';

import { DETAIL_KEYS, DETAIL_TYPES, workoutDetails } from './workout-details';

type Attributes = Record<string, string>;
type UnhashedRun = Omit<RunCandidate, 'id'>;
export interface ParseReport {
  runningCount: number;
  excluded: number;
  ignoredWorkouts: number;
  warnings: Record<string, number>;
}

const distanceUnits: Record<string, number> = { m: 1, km: 1000, mi: 1609.344 };
const durationUnits: Record<string, number> = { s: 1, sec: 1, min: 60, h: 3600, hr: 3600 };
function positive(
  value: string | undefined,
  unit: string | undefined,
  units: Record<string, number>,
): number | null {
  if (
    !value ||
    !/^[+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value.trim()) ||
    !unit ||
    !units[unit]
  )
    return null;
  const parsed = Number(value) * units[unit]!;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export class HealthParser {
  readonly report: ParseReport = { runningCount: 0, excluded: 0, ignoredWorkouts: 0, warnings: {} };
  private parser = new SaxesParser({ xmlns: false });
  private workout: {
    attrs: Attributes;
    stats: Attributes[];
    externalId?: string;
    metadata: Attributes;
    routeFiles: string[];
    routeDepth?: number;
    depth: number;
  } | null = null;
  private depth = 0;
  private seenRoot = false;
  private lastEventPosition = 0;
  private attributeCount = 0;

  constructor(private onRun: (run: UnhashedRun) => void) {
    const mark = () => {
      this.lastEventPosition = this.parser.position;
    };
    this.parser.on('error', () => {
      throw new ImportError('XMLの形式が不正です。完全なexport.xmlを選択してください。');
    });
    this.parser.on('doctype', (value) => {
      if (/<!ENTITY|\b(?:SYSTEM|PUBLIC)\s+["']/i.test(value))
        throw new ImportError('外部参照・独自実体を含むXMLには対応していません。');
      mark();
    });
    this.parser.on('opentagstart', () => {
      this.attributeCount = 0;
      mark();
    });
    this.parser.on('attribute', () => {
      if (++this.attributeCount > 64) throw new ImportError('XMLの属性数が上限を超えています。');
      mark();
    });
    this.parser.on('opentag', (tag) => {
      mark();
      if (++this.depth > 64) throw new ImportError('XMLの階層数が上限を超えています。');
      if (this.depth === 1) {
        if (tag.name !== 'HealthData')
          throw new ImportError('Apple HealthのHealthData形式ではありません。');
        this.seenRoot = true;
      }
      const attrs = tag.attributes;
      if (tag.name === 'Workout' && this.depth === 2) {
        if (attrs.workoutActivityType === 'HKWorkoutActivityTypeRunning') {
          this.report.runningCount++;
          this.workout = { attrs, stats: [], metadata: {}, routeFiles: [], depth: this.depth };
        } else this.report.ignoredWorkouts++;
      } else if (this.workout && this.depth === this.workout.depth + 1) {
        if (
          tag.name === 'WorkoutStatistics' &&
          [
            'HKQuantityTypeIdentifierDistanceWalkingRunning',
            'HKQuantityTypeIdentifierHeartRate',
            ...DETAIL_TYPES,
          ].includes(attrs.type ?? '')
        ) {
          if (this.workout.stats.length >= 16)
            throw new ImportError('Workoutの統計数が上限を超えています。');
          this.workout.stats.push(attrs);
        }
        if (tag.name === 'WorkoutRoute') this.workout.routeDepth = this.depth;
        if (tag.name === 'MetadataEntry' && DETAIL_KEYS.includes(attrs.key ?? ''))
          this.workout.metadata[attrs.key!] = attrs.value ?? '';
        if (
          tag.name === 'MetadataEntry' &&
          ['HKMetadataKeyExternalUUID', 'HKExternalUUID'].includes(attrs.key ?? '')
        )
          this.workout.externalId = attrs.value;
      }
      if (
        this.workout?.routeDepth &&
        this.depth === this.workout.routeDepth + 1 &&
        tag.name === 'FileReference' &&
        attrs.path
      ) {
        if (this.workout.routeFiles.includes(attrs.path)) return;
        if (this.workout.routeFiles.length < 8) this.workout.routeFiles.push(attrs.path);
        else this.warn('1ランのコース参照は8ファイルまで対応しています');
      }
    });
    this.parser.on('closetag', (tag) => {
      mark();
      if (tag.name === 'Workout' && this.workout && this.depth === this.workout.depth) {
        this.extract(this.workout);
        this.workout = null;
      }
      if (this.workout?.routeDepth === this.depth && tag.name === 'WorkoutRoute')
        this.workout.routeDepth = undefined;
      this.depth--;
    });
    this.parser.on('text', mark);
    this.parser.on('comment', mark);
    this.parser.on('cdata', mark);
    this.parser.on('processinginstruction', mark);
  }

  write(chunk: string) {
    // Each call is at most 64 KiB; check during streaming, before any token can grow indefinitely.
    this.parser.write(chunk);
    if (this.parser.position - this.lastEventPosition > 262_144)
      throw new ImportError('XMLの要素サイズが上限を超えています。');
  }

  finish() {
    this.parser.close();
    if (!this.seenRoot) throw new ImportError('Apple Healthのデータが見つかりません。');
    return this.report;
  }

  private warn(message: string) {
    this.report.warnings[message] = (this.report.warnings[message] ?? 0) + 1;
  }
  private exclude(message: string) {
    this.report.excluded++;
    this.warn(message);
  }

  private extract(workout: NonNullable<HealthParser['workout']>) {
    const a = workout.attrs;
    const start = parseHealthDate(a.startDate ?? ''),
      end = parseHealthDate(a.endDate ?? '');
    if (!start || !end || end.iso <= start.iso)
      return this.exclude('開始・終了日時が不正なランを除外しました');
    const duration = positive(a.duration, a.durationUnit, durationUnits);
    if (duration === null)
      return this.exclude('時間が欠損・不正、または未対応単位のランを除外しました');
    const distanceStats = workout.stats.filter(
      (stat) => stat.type === 'HKQuantityTypeIdentifierDistanceWalkingRunning',
    );
    const totalDistance =
      a.totalDistance === undefined
        ? null
        : positive(a.totalDistance, a.totalDistanceUnit, distanceUnits);
    const statsDistance =
      distanceStats.length === 1
        ? positive(distanceStats[0]!.sum, distanceStats[0]!.unit, distanceUnits)
        : null;
    // An explicitly present but invalid total must not be silently replaced by another number.
    if (a.totalDistance !== undefined && totalDistance === null)
      return this.exclude('総距離が不正、または未対応単位のランを除外しました');
    const distance = totalDistance ?? statsDistance;
    if (distance === null)
      return this.exclude('距離が欠損・不正、または統計が曖昧なランを除外しました');
    if (
      totalDistance !== null &&
      statsDistance !== null &&
      Math.abs(totalDistance - statsDistance) > 0.01
    )
      this.warn('総距離と距離統計に差があり、総距離を採用しました');
    const heartStats = workout.stats.filter(
      (stat) => stat.type === 'HKQuantityTypeIdentifierHeartRate',
    );
    let heartRate: number | null = null;
    if (heartStats.length === 1) {
      heartRate = positive(heartStats[0]!.average, heartStats[0]!.unit, { 'count/min': 1, bpm: 1 });
      if (heartRate === null)
        this.warn('平均心拍が不正・欠損、または未対応単位のためデータなしにしました');
    } else if (heartStats.length > 1) this.warn('平均心拍の統計が複数あるためデータなしにしました');
    const sourceName = a.sourceName ?? '',
      device = a.device ?? '';
    const externalId = a.uuid || workout.externalId;
    const sourceId = externalId
      ? `uuid:${externalId}`
      : JSON.stringify([
          sourceName,
          device,
          start.iso,
          end.iso,
          Number(distance.toFixed(6)),
          Number(duration.toFixed(6)),
        ]);
    this.onRun({
      source: 'apple-health',
      sourceId,
      sourceName,
      device,
      startTime: start.iso,
      endTime: end.iso,
      startOffsetMinutes: start.offsetMinutes,
      distanceMeters: distance,
      durationSeconds: duration,
      averageHeartRateBpm: heartRate,
      paceSecondsPerKm: calculatePace(distance, duration)!,
      distanceOrigin: totalDistance === null ? 'statistics' : 'workout',
      heartRateOrigin: heartRate === null ? null : 'workout-statistics',
      details: workoutDetails(workout.stats, workout.metadata, a, duration, workout.routeFiles),
    });
  }
}

export async function identifyRun(run: UnhashedRun): Promise<RunCandidate> {
  const bytes = new TextEncoder().encode(
    JSON.stringify([run.source, run.sourceName, run.sourceId]),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return { ...run, id };
}
