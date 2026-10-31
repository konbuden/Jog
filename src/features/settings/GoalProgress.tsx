import { useEffect, useMemo, useState } from 'react';
import type { Run } from '../../domain/models/run';
import type { GoalSettings } from '../../domain/models/goals';
import { selectedGoalProgress, type GoalBucket } from '../../domain/analytics/goals';
import { monthKey } from '../../domain/analytics/time';
const number = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
const percent = (value: number) => `${value.toFixed(1)}%`;
const state = (bucket: GoalBucket) =>
  bucket.state === 'future'
    ? '未来'
    : bucket.achieved
      ? '達成'
      : bucket.state === 'open'
        ? '進行中'
        : '対象内で未達';
export function GoalProgress({
  runs,
  goals,
  months,
}: {
  runs: readonly Run[];
  goals: GoalSettings;
  months?: readonly string[];
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const scope = months ?? [monthKey(now)];
  const result = useMemo(
    () => selectedGoalProgress(runs, scope, goals, now),
    [runs, scope, goals, now],
  );
  const periodRate =
    result.periodTargetKm > 0 ? (result.periodKm / result.periodTargetKm) * 100 : 0;
  const table = (buckets: GoalBucket[], unit: string, weekly = false) => (
    <div className="table-scroll">
      <table className="goal-detail-table">
        <caption className="sr-only">{weekly ? '対象週ごと' : '対象月ごと'}の目標進捗</caption>
        <thead>
          <tr>
            <th>{weekly ? '対象週（範囲内）' : '対象月'}</th>
            <th>実績 / 目標</th>
            <th>進捗</th>
            <th>状況</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.key}>
              <th scope="row">
                {weekly ? `${bucket.from}〜${bucket.through}` : bucket.key}
                {bucket.partial && <small>部分週</small>}
              </th>
              <td>
                {number(bucket.actual)} / {number(bucket.target)} {unit}
              </td>
              <td>{percent(bucket.percent)}</td>
              <td>{state(bucket)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="panel goal-progress" aria-label="選択期間と今年の目標進捗">
      <div className="panel-heading">
        <div>
          <h2>選択期間・今年の目標進捗</h2>
          <p>
            月・週は対象月の範囲内、年は今年の実績（日本時間・{result.today}時点）で集計します。
          </p>
        </div>
      </div>
      <div className="goal-scope-cards">
        <article className="goal-scope-card" aria-label="月目標の進捗">
          <span>月間距離目標</span>
          <strong>
            {number(goals.monthlyDistanceKm)}
            <small> km / 月</small>
          </strong>
          <b data-testid="monthly-achieved">
            達成 {result.monthlyAchieved} / {result.monthly.length}か月
          </b>
          <p>
            {number(result.periodKm)} / {number(result.periodTargetKm)} km・{percent(periodRate)}
          </p>
          <progress
            aria-label="月間距離目標の進捗"
            value={Math.min(result.periodKm, result.periodTargetKm)}
            max={result.periodTargetKm || 1}
          />
        </article>
        <article className="goal-scope-card" aria-label="週目標の進捗">
          <span>週間回数目標</span>
          {goals.weeklyRunCount === null ? (
            <>
              <strong>未設定</strong>
              <p>「目標・バックアップ」で週間回数を設定できます。</p>
            </>
          ) : (
            <>
              <strong>
                {goals.weeklyRunCount}
                <small> 回 / 週</small>
              </strong>
              <b data-testid="weekly-achieved">
                達成 {result.weeklyAchieved} / {result.weekly.length}週
              </b>
              <p>
                達成週率{' '}
                {percent(
                  result.weekly.length ? (result.weeklyAchieved / result.weekly.length) * 100 : 0,
                )}
                。部分週{result.partialWeeks}週を含み、対象範囲内での達成数です。
              </p>
              <progress
                aria-label="週間目標の達成週数"
                value={result.weeklyAchieved}
                max={result.weekly.length || 1}
              />
            </>
          )}
        </article>
        <article className="goal-scope-card" aria-label="年目標の進捗">
          <span>{result.year}年の年間距離目標</span>
          {goals.annualDistanceKm === null ? (
            <>
              <strong>未設定</strong>
              <p>今年の実績：{number(result.annualKm)} km</p>
            </>
          ) : (
            <>
              <strong>
                {number(goals.annualDistanceKm)}
                <small> km / 年</small>
              </strong>
              <b data-testid="annual-progress">
                実績 {number(result.annualKm)} km・{percent(result.annualPercent!)}
              </b>
              <p>
                {result.year}-01-01〜{result.today}。対象月の選択に関係なく今年の全実績です。
              </p>
              <progress
                aria-label="年間距離目標の進捗"
                value={Math.min(result.annualKm, goals.annualDistanceKm)}
                max={goals.annualDistanceKm}
              />
            </>
          )}
        </article>
      </div>
      {result.monthly.length > 0 && (
        <details className="goal-breakdown">
          <summary>月ごとの目標・達成状況を見る</summary>
          {table(result.monthly, 'km')}
        </details>
      )}
      {goals.weeklyRunCount !== null && result.weekly.length > 0 && (
        <details className="goal-breakdown">
          <summary>週ごとの目標・達成状況を見る</summary>
          <p className="goal-period-note">
            月曜〜日曜で区切り、対象月に含まれる日だけを集計します。期間外の実績を含まない部分週も対象数に含みます。
          </p>
          {table(result.weekly, '回', true)}
        </details>
      )}
    </section>
  );
}
