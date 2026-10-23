import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  RotateCcw,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import type { Run, RunFilter } from '../domain/models/run';
import { filterRuns, monthlySummary, summarize } from '../domain/analytics/running';
import { monthKey, recentMonths } from '../domain/analytics/time';
import { formatHeartRate, formatKm, formatPace } from '../components/format';
import { PaceChart } from '../components/PaceChart';
import { RunHistory } from '../components/RunHistory';

const initial = { distance: 'all', heart: 'all', from: '', through: '' };
const distanceBands: Record<string, RunFilter> = {
  all: {},
  short: { maxDistanceKm: 5 },
  medium: { minDistanceKm: 5, maxDistanceKm: 10 },
  long: { minDistanceKm: 10, maxDistanceKm: 20 },
  veryLong: { minDistanceKm: 20 },
};
const heartBands: Record<string, RunFilter> = {
  all: {},
  under130: { maxHeartRate: 130 },
  zone130: { minHeartRate: 130, maxHeartRate: 140 },
  zone140: { minHeartRate: 140, maxHeartRate: 150 },
  over150: { minHeartRate: 150 },
  missing: { missingHeartRateOnly: true },
};

export function Analysis({ runs }: { runs: readonly Run[] }) {
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(0);
  const [endMonth, setEndMonth] = useState('');
  const invalidDates = Boolean(filters.from && filters.through && filters.from > filters.through);
  const filtered = useMemo(
    () =>
      invalidDates
        ? []
        : filterRuns(runs, {
            ...distanceBands[filters.distance],
            ...heartBands[filters.heart],
            from: filters.from,
            through: filters.through,
          }),
    [runs, filters, invalidDates],
  );
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const chartMonth =
    endMonth ||
    filters.through.slice(0, 7) ||
    (filtered[0] ? monthKey(filtered[0].startTime) : monthKey(new Date()));
  const months = useMemo(
    () => recentMonths(new Date(`${chartMonth}-15T12:00:00+09:00`), 12),
    [chartMonth],
  );
  const series = useMemo(() => monthlySummary(filtered, months), [filtered, months]);
  const heartSeries = useMemo(
    () => monthlySummary(filterRuns(filtered, { minHeartRate: 130, maxHeartRate: 140 }), months),
    [filtered, months],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const safePage = Math.min(page, pageCount - 1);
  const update = (key: keyof typeof initial, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
    setEndMonth('');
  };
  return (
    <>
      <section className="panel filter-panel" aria-labelledby="filter-title">
        <div className="filter-heading">
          <h2 id="filter-title">
            <SlidersHorizontal size={17} />
            記録を絞り込む
          </h2>
          <button
            className="text-button"
            onClick={() => {
              setFilters(initial);
              setPage(0);
              setEndMonth('');
            }}
          >
            <RotateCcw size={13} />
            リセット
          </button>
        </div>
        <div className="filter-fields">
          <label>
            距離帯
            <select
              aria-label="距離帯"
              value={filters.distance}
              onChange={(event) => update('distance', event.target.value)}
            >
              <option value="all">すべての距離</option>
              <option value="short">5km未満</option>
              <option value="medium">5〜10km未満</option>
              <option value="long">10〜20km未満</option>
              <option value="veryLong">20km以上</option>
            </select>
          </label>
          <label>
            開始日
            <input
              type="date"
              value={filters.from}
              onChange={(event) => update('from', event.target.value)}
            />
          </label>
          <label>
            終了日
            <input
              type="date"
              value={filters.through}
              onChange={(event) => update('through', event.target.value)}
            />
          </label>
          <label>
            平均心拍帯
            <select
              aria-label="平均心拍帯"
              value={filters.heart}
              onChange={(event) => update('heart', event.target.value)}
            >
              <option value="all">すべての心拍</option>
              <option value="under130">130bpm未満</option>
              <option value="zone130">130〜139bpm</option>
              <option value="zone140">140〜149bpm</option>
              <option value="over150">150bpm以上</option>
              <option value="missing">心拍データなし</option>
            </select>
          </label>
        </div>
        {invalidDates ? (
          <p role="alert" className="error-message">
            開始日は終了日以前の日付にしてください。
          </p>
        ) : (
          <p className="filter-hint">
            すべてのグラフ・記録に条件を適用します。日付は日本時間、距離・心拍帯の上限は含みません。
          </p>
        )}
      </section>
      <div className="analysis-overview" role="status">
        <strong data-testid="matching-count">
          {filtered.length}
          <span>件のランニング</span>
        </strong>
        <span>
          合計 <b>{formatKm(summary.distanceMeters)} km</b>
        </span>
        <span>
          平均ペース <b>{formatPace(summary.paceSecondsPerKm)} /km</b>
        </span>
        <span>
          平均心拍 <b>{formatHeartRate(summary.averageHeartRateBpm)}</b>
          <small>
            （取得 {summary.heartRateCount}/{summary.count}件）
          </small>
        </span>
      </div>
      <div className="section-toolbar">
        <div>
          <span className="section-kicker">ペースの変化</span>
          <span className="timezone-label">
            表示期間：{months[0]} 〜 {chartMonth}
          </span>
        </div>
        <label className="month-select">
          <span aria-hidden="true">
            最終月 {chartMonth.slice(0, 4)}年{Number(chartMonth.slice(5))}月
          </span>
          <input
            type="month"
            aria-label="推移の最終月"
            value={chartMonth}
            min="1900-01"
            max="9999-12"
            onChange={(event) => {
              if (/^\d{4}-\d{2}$/.test(event.target.value)) setEndMonth(event.target.value);
            }}
          />
        </label>
      </div>
      <div className="analysis-charts">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <TrendingUp size={16} />
                月別平均ペース
              </h2>
              <p>総時間 ÷ 総距離から計算した平均</p>
            </div>
            <span className="subtle-badge">12か月</span>
          </div>
          <PaceChart data={series} label="月別平均ペース" />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <Heart size={16} />
                心拍130台でのペース推移
              </h2>
              <p>平均心拍130以上140未満のランを月別に集計</p>
            </div>
            <span className="subtle-badge peach-badge">
              {heartSeries.reduce((sum, item) => sum + item.count, 0)}回
            </span>
          </div>
          <PaceChart data={heartSeries} label="心拍130台での月別ペース推移" heartRate />
        </section>
      </div>
      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <h2>ランニングごとの分析</h2>
            <p>開始日時の新しい順・1ページ20件</p>
          </div>
          <span className="subtle-badge">{filtered.length}件</span>
        </div>
        {filtered.length ? (
          <RunHistory runs={filtered.slice(safePage * 20, safePage * 20 + 20)} analysis />
        ) : (
          <div className="empty-history">
            <SlidersHorizontal size={27} />
            <p>条件に一致するランニングはありません。</p>
            <span>
              {runs.length
                ? '条件を変更するか、リセットしてください。'
                : 'Apple Healthのファイルをインポートしてください。'}
            </span>
          </div>
        )}
        {pageCount > 1 && (
          <div className="pagination">
            <button
              className="icon-button"
              aria-label="前のページ"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              {safePage + 1} / {pageCount}
            </span>
            <button
              className="icon-button"
              aria-label="次のページ"
              disabled={safePage + 1 >= pageCount}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </section>
      <div className="analysis-disclaimer">
        <strong>数値の見方</strong>
        <p>
          10km等速換算は、各ランの平均ペースのまま10km走った場合の時間です。レース記録の予測ではありません。心拍はWorkout内に平均値がある場合だけ使用し、不明な値は推定しません。
        </p>
      </div>
    </>
  );
}
