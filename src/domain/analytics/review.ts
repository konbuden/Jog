import type { Run } from '../models/run';
import type { RunLap, RunReview } from '../models/review';
export function validateLaps(laps: readonly RunLap[], run: Run): string | null {
  if (laps.length > 100) return '区間ラップは100件まで入力できます。';
  if (
    laps.some(
      (lap) =>
        !Number.isFinite(lap.distanceMeters) ||
        lap.distanceMeters <= 0 ||
        lap.distanceMeters > 100000 ||
        !Number.isInteger(lap.durationSeconds) ||
        lap.durationSeconds <= 0 ||
        lap.durationSeconds > 86400 ||
        (lap.averageHeartRateBpm !== null &&
          (!Number.isFinite(lap.averageHeartRateBpm) ||
            lap.averageHeartRateBpm <= 0 ||
            lap.averageHeartRateBpm > 300)) ||
        (lap.averagePowerWatts !== null &&
          (!Number.isFinite(lap.averagePowerWatts) ||
            lap.averagePowerWatts < 0 ||
            lap.averagePowerWatts > 3000)),
    )
  )
    return '区間の距離・時間・心拍・パワーが入力範囲外です。';
  if (!laps.length) return null;
  const distance = laps.reduce((sum, lap) => sum + lap.distanceMeters, 0),
    duration = laps.reduce((sum, lap) => sum + lap.durationSeconds, 0);
  if (Math.abs(distance - run.distanceMeters) > Math.max(100, run.distanceMeters * 0.02))
    return '区間距離の合計が記録と一致しません。全区間を入力してください（許容差100mまたは2%）。';
  if (Math.abs(duration - run.durationSeconds) > Math.max(30, run.durationSeconds * 0.05))
    return '区間時間の合計が記録と一致しません。使用する時間と全区間を確認してください（許容差30秒または5%）。';
  return null;
}
export function parseLaps(text: string, run: Run): RunLap[] {
  if (text.length > 20000) throw new Error('区間入力は20000文字までです。');
  if (!text.trim()) return [];
  const lines = text.trim().split(/\r?\n/);
  if (lines.length > 100) throw new Error('区間ラップは100件まで入力できます。');
  const number = (value: string) => (/^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN);
  const laps = lines.map((line, index) => {
    const fields = line.split(',').map((value) => value.trim());
    const time = fields[1] ?? '';
    if (fields.length < 2 || fields.length > 4 || !/^\d+:[0-5]\d(?::[0-5]\d)?$/.test(time))
      throw new Error(
        `${index + 1}行目：距離km, 時間m:ss（またはh:mm:ss）, 心拍（任意）, パワー（任意）で入力してください。`,
      );
    return {
      distanceMeters: number(fields[0]!) * 1000,
      durationSeconds: time.split(':').reduce((sum, part) => sum * 60 + Number(part), 0),
      averageHeartRateBpm: fields[2] ? number(fields[2]) : null,
      averagePowerWatts: fields[3] ? number(fields[3]) : null,
    };
  });
  const error = validateLaps(laps, run);
  if (error) throw new Error(error);
  return laps;
}
export function lapsText(laps: readonly RunLap[]): string {
  return laps
    .map((lap) => {
      const seconds = lap.durationSeconds;
      return [
        lap.distanceMeters / 1000,
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
        lap.averageHeartRateBpm ?? '',
        lap.averagePowerWatts ?? '',
      ].join(', ');
    })
    .join('\n');
}
export function validateReview(review: RunReview, run: Run): string | null {
  if (
    review.id !== run.id ||
    !['unknown', 'easy', 'steady', 'progressive', 'interval'].includes(review.purpose) ||
    !['unknown', 'ease', 'push', 'steady'].includes(review.lateIntent) ||
    !['unknown', 'yes', 'no'].includes(review.extraDistance) ||
    !['unknown', 'normal', 'tired'].includes(review.nextDay) ||
    !['unknown', 'none', 'present'].includes(review.discomfort) ||
    (review.rpe !== null && (!Number.isInteger(review.rpe) || review.rpe < 1 || review.rpe > 10))
  )
    return '振り返りの選択値・RPEが不正です。';
  return validateLaps(review.laps, run);
}
