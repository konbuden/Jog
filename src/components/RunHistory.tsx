import { Footprints } from 'lucide-react';
import type { Run } from '../domain/models/run';
import { equivalent10Km } from '../domain/analytics/running';
import { formatDate, formatDuration, formatHeartRate, formatKm, formatPace } from './format';

export function RunHistory({
  runs,
  analysis = false,
  onSelect,
  selectedId,
}: {
  runs: readonly Run[];
  analysis?: boolean;
  onSelect?: (run: Run) => void;
  selectedId?: string;
}) {
  if (runs.length === 0)
    return (
      <div className="empty-history">
        <Footprints size={28} />
        <p>表示できるランニング記録はありません。</p>
        <span>記録をインポートすると、ここに表示されます。</span>
      </div>
    );
  return (
    <div className="table-scroll">
      <table className={`run-table${analysis ? ' analysis-table' : ''}`}>
        <caption className="sr-only">
          {analysis ? 'ランニングごとの走力分析' : '直近のランニング履歴'}
        </caption>
        <thead>
          <tr>
            <th>ランニング日</th>
            <th>距離</th>
            <th>時間</th>
            <th>平均ペース</th>
            <th>平均心拍</th>
            {analysis && <th>10km等速換算</th>}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <span className="run-date">
                  <span className="run-icon">
                    <Footprints size={17} />
                  </span>
                  <span>
                    {formatDate(run.startTime)}
                    <small>
                      {new Intl.DateTimeFormat('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      }).format(new Date(run.startTime))}
                      ・ランニング
                    </small>
                  </span>
                </span>
                {onSelect && (
                  <button
                    className="text-button run-detail-trigger"
                    aria-label={`${formatDate(run.startTime)}の詳細`}
                    aria-pressed={run.id === selectedId}
                    onClick={() => onSelect(run)}
                  >
                    詳細を見る
                  </button>
                )}
              </td>
              <td className="distance-cell">
                {formatKm(run.distanceMeters)} <span>km</span>
              </td>
              <td>{formatDuration(run.durationSeconds)}</td>
              <td>
                {formatPace(run.paceSecondsPerKm)}
                <span className="cell-unit"> /km</span>
              </td>
              <td className={run.averageHeartRateBpm === null ? 'missing-value' : ''}>
                {formatHeartRate(run.averageHeartRateBpm)}
              </td>
              {analysis && (
                <td>{formatDuration(equivalent10Km(run.distanceMeters, run.durationSeconds))}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
