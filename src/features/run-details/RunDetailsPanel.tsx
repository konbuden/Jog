import { useEffect, useId, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, MapPin } from 'lucide-react';
import type { Run } from '../../domain/models/run';
import { equivalent10Km } from '../../domain/analytics/running';
import { db } from '../../infrastructure/db/database';
import { routeGeometry } from '../../domain/analytics/route';
import {
  formatDate,
  formatDuration,
  formatHeartRate,
  formatKm,
  formatPace,
} from '../../components/format';
export function RunDetailsPanel({
  run,
  onClose,
  manageFocus = true,
}: {
  run: Run;
  onClose: () => void;
  manageFocus?: boolean;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const result = useLiveQuery(async () => {
    try {
      return { route: await db.routes.get(run.id), error: false };
    } catch {
      return { route: undefined, error: true };
    }
  }, [run.id]);
  useEffect(() => {
    if (!manageFocus) return;
    const previous = document.activeElement;
    heading.current?.focus();
    heading.current?.scrollIntoView({ block: 'start' });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [manageFocus]);
  const details = run.details ?? {};
  const geometry = result?.route ? routeGeometry(result.route) : [];
  const first = geometry[0]?.[0],
    last = geometry.at(-1)?.at(-1);
  const value = (number: number | undefined, unit: string, digits = 1) =>
    number === undefined
      ? 'データなし'
      : `${number.toLocaleString('ja-JP', { maximumFractionDigits: digits })} ${unit}`;
  const metrics = [
    ['距離', `${formatKm(run.distanceMeters)} km`],
    ['時間', formatDuration(run.durationSeconds)],
    ['平均ペース', `${formatPace(run.paceSecondsPerKm)} /km`],
    [
      '10kmあたりの時間（等速換算）',
      formatDuration(equivalent10Km(run.distanceMeters, run.durationSeconds)),
    ],
    ['平均心拍', formatHeartRate(run.averageHeartRateBpm)],
    ['平均ケイデンス', value(details.averageCadenceSpm, '歩/分')],
    ['歩数', value(details.totalSteps, '歩', 0)],
    ['消費エネルギー（アクティブ）', value(details.activeEnergyKcal, 'kcal')],
    ['平均ランニングパワー', value(details.averagePowerWatts, 'W')],
    ['平均歩幅', value(details.averageStrideLengthMeters, 'm', 2)],
    ['平均接地時間', value(details.averageGroundContactMilliseconds, 'ms')],
    ['平均上下動', value(details.averageVerticalOscillationCentimeters, 'cm')],
    ['最大心拍', value(details.maximumHeartRateBpm, 'bpm', 0)],
    ['上昇高度', value(details.elevationAscendedMeters, 'm')],
    ['走行環境', details.indoor === undefined ? 'データなし' : details.indoor ? '屋内' : '屋外'],
  ];
  return (
    <section className="panel run-details" aria-labelledby={titleId}>
      <div className="panel-heading">
        <div>
          <div className="eyebrow">RUN DETAILS</div>
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {formatDate(run.startTime)}のランニング詳細
          </h2>
          <p>{details.workoutName || '選択した記録の追加情報'}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="ランニング詳細を閉じる">
          <X size={20} />
        </button>
      </div>
      <div className="route-card">
        <h3>
          <MapPin size={17} />
          コース情報
        </h3>
        {geometry.length ? (
          <figure className="route-figure">
            <svg viewBox="0 0 600 320" role="img" aria-label="選択したランニングのGPSコース">
              <title>GPSコース・北が上・背景地図なし</title>
              {geometry.map((segment, index) => (
                <polyline
                  key={index}
                  points={segment.map((p) => p.join(',')).join(' ')}
                  className="route-line"
                />
              ))}
              {first && <circle cx={first[0]} cy={first[1]} r="5" className="route-start" />}
              {last && <circle cx={last[0]} cy={last[1]} r="5" className="route-end" />}
              <text x="568" y="24" className="axis-label">
                北 ↑
              </text>
            </svg>
            <figcaption>
              緑：スタート／白：ゴール・北が上。背景地図は使用しません。
              {result?.route?.incomplete && '一部の参照コースを読み込めていません。'}
              {result?.route?.sampled ? '表示用にGPS点を間引いています。' : ''}（元のGPS点{' '}
              {result?.route?.pointCount.toLocaleString()}点）
            </figcaption>
          </figure>
        ) : (
          <p className="muted">
            {result?.error
              ? '保存済みコースを読み込めませんでした。'
              : !result
                ? 'コースを読み込んでいます…'
                : details.routeFiles?.length
                  ? 'コース座標が未保存です。参照先のGPXを含む元のZIPを再インポートしてください。'
                  : 'この記録にはコース情報がありません。以前取り込んだ記録は、元のZIPの再インポートで追加できる場合があります。'}
          </p>
        )}
      </div>
      <dl className="detail-metrics">
        {metrics.map(([label, text]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      {details.cadenceOrigin === 'steps-duration' && (
        <p className="notice">
          平均ケイデンスは、Workout内の歩数 ÷
          Workoutの時間（分）で算出しています。瞬間値の平均とは異なります。
        </p>
      )}
      <p className="muted detail-source">
        出典：{run.sourceName || 'データなし'}
        {run.device && ` ／ ${run.device}`}
        。元データがない指標は推定で補いません。追加指標は同じWorkout内の値のみ使用します。
      </p>
    </section>
  );
}
