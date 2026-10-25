import { useEffect, useMemo, useState } from 'react';
import type { Run } from '../../domain/models/run';
import type { GoalSettings } from '../../domain/models/goals';
import { currentGoalProgress } from '../../domain/analytics/calendar';
import { formatKm } from '../../components/format';
export function GoalProgress({ runs, goals }: { runs: readonly Run[]; goals: GoalSettings }) {
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
  const progress = useMemo(() => currentGoalProgress(runs, now), [runs, now]);
  if (goals.weeklyRunCount === null && goals.annualDistanceKm === null) return null;
  return (
    <section className="panel goal-progress" aria-label="今週と今年の目標進捗">
      <div className="panel-heading">
        <div>
          <h2>今週・今年の目標</h2>
          <p>今日（{progress.today}・日本時間）を基準に集計。上の対象月の選択とは別の期間です。</p>
        </div>
      </div>
      <div className="goal-progress-grid">
        {goals.weeklyRunCount !== null && (
          <div>
            <span>
              今週 {progress.weekStart}〜{progress.weekEnd}
            </span>
            <strong>
              {progress.weekly.count}
              <small> / {goals.weeklyRunCount} 回</small>
            </strong>
            <progress
              aria-label="週間回数目標の進捗"
              value={Math.min(progress.weekly.count, goals.weeklyRunCount)}
              max={goals.weeklyRunCount}
            />
          </div>
        )}
        {goals.annualDistanceKm !== null && (
          <div>
            <span>{progress.year}年の走行距離</span>
            <strong>
              {formatKm(progress.annual.distanceMeters)}
              <small> / {goals.annualDistanceKm.toLocaleString('ja-JP')} km</small>
            </strong>
            <progress
              aria-label="年間距離目標の進捗"
              value={Math.min(progress.annual.distanceMeters / 1000, goals.annualDistanceKm)}
              max={goals.annualDistanceKm}
            />
          </div>
        )}
      </div>
    </section>
  );
}
