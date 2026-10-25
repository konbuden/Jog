import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { Run, RunFilter } from '../../domain/models/run';
import {
  comparePeriods,
  previousPeriod,
  shiftMonth,
  type MonthRange,
} from '../../domain/analytics/comparison';
import { validMonth } from '../../domain/analytics/period';
import { monthKey } from '../../domain/analytics/time';
import { formatDuration, formatHeartRate, formatKm, formatPace } from '../../components/format';
export function ComparisonPanel({
  runs,
  months,
  filter,
}: {
  runs: readonly Run[];
  months: string[];
  filter: RunFilter;
}) {
  const now = monthKey(new Date());
  const initial = { from: months[0] ?? now, through: months.at(-1) ?? now };
  const [a, setA] = useState<MonthRange>(() => previousPeriod(initial)),
    [b, setB] = useState<MonthRange>(initial);
  const result = useMemo(() => comparePeriods(runs, a, b, filter), [runs, a, b, filter]);
  const signed = (value: number | null, format: (value: number) => string) =>
    value === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
  const fields = (label: string, range: MonthRange, setRange: (value: MonthRange) => void) => (
    <fieldset>
      <legend>{label}</legend>
      {(['from', 'through'] as const).map((key, index) => (
        <label key={key}>
          {index ? '終了月' : '開始月'}
          <span className="period-month">
            <span aria-hidden="true">
              {validMonth(range[key])
                ? `${range[key].slice(0, 4)}年${Number(range[key].slice(5))}月`
                : '月を選択'}{' '}
              ▾
            </span>
            <input
              type="month"
              aria-label={`${label}の${index ? '終了月' : '開始月'}`}
              value={range[key]}
              min="1900-01"
              max="9999-12"
              onChange={(e) => {
                if (validMonth(e.target.value)) setRange({ ...range, [key]: e.target.value });
              }}
            />
          </span>
        </label>
      ))}
    </fieldset>
  );
  const rows = [
    [
      '走行距離',
      `${formatKm(result.a.distanceMeters)} km`,
      `${formatKm(result.b.distanceMeters)} km`,
      signed(result.b.distanceMeters - result.a.distanceMeters, (v) => `${formatKm(v)} km`),
    ],
    [
      '月平均距離',
      `${formatKm(result.a.distancePerMonthMeters)} km`,
      `${formatKm(result.b.distancePerMonthMeters)} km`,
      signed(
        result.b.distancePerMonthMeters - result.a.distancePerMonthMeters,
        (v) => `${formatKm(v)} km`,
      ),
    ],
    [
      'ランニング回数',
      `${result.a.count}回`,
      `${result.b.count}回`,
      signed(result.b.count - result.a.count, (v) => `${v}回`),
    ],
    [
      '走行日数',
      `${result.a.runningDays}日`,
      `${result.b.runningDays}日`,
      signed(result.b.runningDays - result.a.runningDays, (v) => `${v}日`),
    ],
    [
      '合計時間',
      formatDuration(result.a.durationSeconds),
      formatDuration(result.b.durationSeconds),
      signed(result.b.durationSeconds - result.a.durationSeconds, formatDuration),
    ],
    [
      '平均ペース',
      `${formatPace(result.a.paceSecondsPerKm)} /km`,
      `${formatPace(result.b.paceSecondsPerKm)} /km`,
      signed(result.paceDifference, (v) => `${formatPace(v)} /km`),
    ],
    [
      '平均心拍',
      formatHeartRate(result.a.averageHeartRateBpm),
      formatHeartRate(result.b.averageHeartRateBpm),
      signed(result.heartDifference, (v) => `${v.toFixed(1)} bpm`),
    ],
    [
      '心拍取得件数',
      `${result.a.heartRateCount}/${result.a.count}件`,
      `${result.b.heartRateCount}/${result.b.count}件`,
      '—',
    ],
  ];
  return (
    <details className="panel comparison-panel" aria-labelledby="comparison-title">
      <summary className="panel-heading" aria-label="期間比較">
        <div>
          <h2 id="comparison-title">
            <ArrowLeftRight size={17} />
            期間比較
          </h2>
          <p>2つの期間を同じ距離帯・心拍帯で比較する</p>
        </div>
      </summary>
      <div className="comparison-content">
        <div className="comparison-presets">
          <button
            className="secondary-button"
            onClick={() => {
              const range = { from: now, through: now };
              setB(range);
              setA(previousPeriod(range));
            }}
          >
            前月と今月
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              const range = { from: shiftMonth(now, -2), through: now };
              setB(range);
              setA(previousPeriod(range));
            }}
          >
            直近3か月とその前
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              setA({ from: shiftMonth(b.from, -12), through: shiftMonth(b.through, -12) })
            }
          >
            前年同期
          </button>
        </div>
        <div className="comparison-ranges">
          {fields('期間A', a, setA)}
          {fields('期間B', b, setB)}
        </div>
        <p className="muted comparison-note">
          比較期間は上の対象月・開始日・終了日とは独立しています。距離帯・平均心拍帯の条件は共通で適用します。
        </p>
        {!result.valid ? (
          <p role="alert" className="error-message">
            比較する開始月・終了月を正しい順で、各100年以内に指定してください。
          </p>
        ) : (
          <>
            <p className="comparison-periods">
              A：{a.from}〜{a.through}（{result.a.months}か月） ／ B：{b.from}〜{b.through}（
              {result.b.months}か月）
            </p>
            {result.overlap && <p className="notice">比較期間が重複しています。</p>}
            {result.a.months !== result.b.months && (
              <p className="notice">
                期間の月数が異なります。月平均距離もあわせて確認してください。
              </p>
            )}
            <div className="table-scroll">
              <table className="comparison-table">
                <caption className="sr-only">期間Aと期間Bの比較結果</caption>
                <thead>
                  <tr>
                    <th>指標</th>
                    <th>期間A</th>
                    <th>期間B</th>
                    <th>差（B−A）</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, left, right, delta]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{left}</td>
                      <td>{right}</td>
                      <td>{delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="comparison-note">
              距離の増減率：
              {result.distancePercent === null
                ? '—（期間Aの距離が0）'
                : signed(result.distancePercent, (v) => `${v.toFixed(1)}%`)}
              。ペース差がマイナスなら短縮です。件数・距離・心拍取得数や走行条件が異なるため、差だけで走力の変化を断定しません。
            </p>
          </>
        )}
      </div>
    </details>
  );
}
