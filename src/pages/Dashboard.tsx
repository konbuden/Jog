import { ArrowRight, Flag, Heart, Timer, Upload, Footprints } from 'lucide-react';
import { useMemo } from 'react';
import type { Run } from '../domain/models/run';
import { monthlySummary, summarize } from '../domain/analytics/running';
import { DistanceChart } from '../components/DistanceChart';
import { RunHistory } from '../components/RunHistory';
import type { GoalSettings } from '../domain/models/goals';
import { CalendarPanel } from '../features/calendar/CalendarPanel';
import { GoalProgress } from '../features/settings/GoalProgress';
import { formatDuration, formatKm, formatPace } from '../components/format';

export function Dashboard({
  runs,
  months,
  hasData,
  allRuns,
  goals,
  onImport,
}: {
  runs: readonly Run[];
  months: string[];
  hasData: boolean;
  allRuns: readonly Run[];
  goals: GoalSettings;
  onImport: () => void;
}) {
  const series = useMemo(() => monthlySummary(runs, months), [runs, months]);
  const summary = useMemo(() => summarize(runs), [runs]);
  const goalKm = Math.round(Math.max(1, months.length) * goals.monthlyDistanceKm * 10) / 10;
  const goalPercent = (summary.distanceMeters / (goalKm * 1000)) * 100;
  const single = months.length === 1;
  const circumference = 2 * Math.PI * 46;
  return (
    <>
      {!hasData && (
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
      <section className="metrics-grid" aria-label="対象期間のサマリー">
        <article className="metric-card goal-card">
          <div className="goal-copy">
            <div className="metric-label">
              <span className="metric-icon lime">
                <Flag size={16} />
              </span>
              {single ? '月間走行距離' : '期間走行距離'}
              <span className="month-badge">{months.length}か月</span>
            </div>
            <div className="metric-value" data-testid="monthly-distance">
              {formatKm(summary.distanceMeters)}
              <span>km</span>
            </div>
            <p className="goal-note">
              {goalPercent >= 100 ? (
                `期間目標${goalKm}kmを達成しました！`
              ) : (
                <>
                  目標まであと{' '}
                  <strong>
                    {formatKm(Math.max(0, goalKm * 1000 - summary.distanceMeters))} km
                  </strong>
                </>
              )}
            </p>
          </div>
          <div
            className="goal-ring"
            aria-label={`${goalKm}km目標の達成率 ${goalPercent.toFixed(1)}%`}
          >
            <svg viewBox="0 0 112 112" aria-hidden="true">
              <circle cx="56" cy="56" r="46" className="ring-track" />
              <circle
                cx="56"
                cy="56"
                r="46"
                className="ring-progress"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - Math.min(goalPercent, 100) / 100)}
              />
            </svg>
            <div>
              <strong>
                {goalPercent.toFixed(1)}
                <span>%</span>
              </strong>
              <small>目標 {goalKm} km</small>
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
              <p>選択した期間の積み重ねを振り返る</p>
            </div>
            <span className="subtle-badge">{months.length}か月</span>
          </div>
          <DistanceChart
            goalKm={goals.monthlyDistanceKm}
            data={series}
            selectedMonth={months.at(-1) ?? ''}
          />
        </section>
        <section className="panel running-note">
          <div className="note-symbol">
            <Footprints size={23} />
          </div>
          <div className="eyebrow">対象期間の積み重ね</div>
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
      <GoalProgress runs={allRuns} goals={goals} months={months} />
      <CalendarPanel
        key={months.join(',')}
        runs={runs}
        allRuns={allRuns}
        monthlyGoalKm={goals.monthlyDistanceKm}
        months={months}
      />
      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <h2>最近のランニング</h2>
            <p>対象期間の直近10回・日本時間・10kmの時間は等速換算</p>
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
