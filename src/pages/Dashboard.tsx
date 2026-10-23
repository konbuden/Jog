import { ArrowRight, Flag, Heart, Timer, Upload, Footprints } from 'lucide-react';
import { useMemo } from 'react';
import type { Run } from '../domain/models/run';
import { monthlySummary } from '../domain/analytics/running';
import { recentMonths } from '../domain/analytics/time';
import { DistanceChart } from '../components/DistanceChart';
import { RunHistory } from '../components/RunHistory';
import { formatDuration, formatKm, formatPace } from '../components/format';

export function Dashboard({
  runs,
  month,
  onImport,
}: {
  runs: readonly Run[];
  month: string;
  onImport: () => void;
}) {
  const months = useMemo(() => recentMonths(new Date(`${month}-15T12:00:00+09:00`), 6), [month]);
  const series = useMemo(() => monthlySummary(runs, months), [runs, months]);
  const summary = series[series.length - 1]!;
  const circumference = 2 * Math.PI * 46;
  return (
    <>
      {runs.length === 0 && (
        <div className="welcome-banner">
          <div className="welcome-icon">
            <Footprints size={26} />
          </div>
          <div>
            <h2>最初のランニングを、ここから。</h2>
            <p>Apple Healthのデータを読み込んで、日々の積み重ねを見える形に。</p>
          </div>
          <button className="secondary-button" onClick={onImport}>
            記録を読み込む
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      <section className="metrics-grid" aria-label="月間サマリー">
        <article className="metric-card goal-card">
          <div className="goal-copy">
            <div className="metric-label">
              <span className="metric-icon lime">
                <Flag size={16} />
              </span>
              月間走行距離<span className="month-badge">{Number(month.slice(5))}月</span>
            </div>
            <div className="metric-value" data-testid="monthly-distance">
              {formatKm(summary.distanceMeters)}
              <span>km</span>
            </div>
            <p className="goal-note">
              {summary.goalPercent >= 100 ? (
                '月間100kmの目標を達成しました！'
              ) : (
                <>
                  目標まであと{' '}
                  <strong>{formatKm(Math.max(0, 100_000 - summary.distanceMeters))} km</strong>
                </>
              )}
            </p>
          </div>
          <div
            className="goal-ring"
            aria-label={`100km目標の達成率 ${summary.goalPercent.toFixed(1)}%`}
          >
            <svg viewBox="0 0 112 112" aria-hidden="true">
              <circle cx="56" cy="56" r="46" className="ring-track" />
              <circle
                cx="56"
                cy="56"
                r="46"
                className="ring-progress"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - Math.min(summary.goalPercent, 100) / 100)}
              />
            </svg>
            <div>
              <strong>
                {summary.goalPercent.toFixed(1)}
                <span>%</span>
              </strong>
              <small>目標 100 km</small>
            </div>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-label">
            <span className="metric-icon blue">
              <Timer size={17} />
            </span>
            平均ペース
          </div>
          <div className="metric-value secondary-value" data-testid="average-pace">
            {formatPace(summary.paceSecondsPerKm)}
            <span>/km</span>
          </div>
          <p className="metric-footnote">距離で加重した平均</p>
          <div className="metric-divider" />
          <span className="stat-detail">
            合計ランニング時間 <strong>{formatDuration(summary.durationSeconds)}</strong>
          </span>
        </article>
        <article className="metric-card">
          <div className="metric-label">
            <span className="metric-icon peach">
              <Heart size={17} />
            </span>
            平均心拍数
          </div>
          <div className="metric-value secondary-value" data-testid="average-heart-rate">
            {summary.averageHeartRateBpm === null ? '—' : Math.round(summary.averageHeartRateBpm)}
            <span>bpm</span>
          </div>
          <p className="metric-footnote">
            {summary.averageHeartRateBpm === null
              ? '心拍データはありません'
              : '心拍取得済みランの時間加重平均'}
          </p>
          <div className="metric-divider" />
          <span className="stat-detail">
            心拍データ取得{' '}
            <strong>
              {summary.heartRateCount} / {summary.count} 回
            </strong>
          </span>
        </article>
      </section>
      <div className="dashboard-chart-grid">
        <section className="panel distance-panel">
          <div className="panel-heading">
            <div>
              <h2>月間走行距離の推移</h2>
              <p>6か月の積み重ねを振り返る</p>
            </div>
            <span className="subtle-badge">直近6か月</span>
          </div>
          <DistanceChart data={series} selectedMonth={month} />
        </section>
        <section className="panel running-note">
          <div className="note-symbol">
            <Footprints size={23} />
          </div>
          <div className="eyebrow">今月の積み重ね</div>
          <div className="run-count">
            {summary.count}
            <span>回のランニング</span>
          </div>
          <div className="note-line" />
          <p>速さも、距離も、あなたのペースで。</p>
          <span className="muted">一回ごとの記録が、これからの走りにつながります。</span>
          <a href="#/analysis" className="inline-link">
            走りの変化を見る
            <ArrowRight size={16} />
          </a>
        </section>
      </div>
      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <h2>最近のランニング</h2>
            <p>直近10回の記録・日本時間</p>
          </div>
          <a href="#/analysis" className="inline-link">
            すべての記録
            <ArrowRight size={15} />
          </a>
        </div>
        <RunHistory runs={runs.slice(0, 10)} />
        {runs.length === 0 && (
          <button className="text-button empty-import" onClick={onImport}>
            <Upload size={15} />
            データをインポート
          </button>
        )}
      </section>
      <p className="storage-hint">
        記録はこのブラウザに保存されます。ブラウザデータを削除すると記録も消えるため、元のエクスポートファイルは保管してください。
      </p>
    </>
  );
}
