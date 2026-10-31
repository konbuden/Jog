import { useEffect, useState } from 'react';
import type { Run } from '../../domain/models/run';
import { evaluateRun, type RunEvaluation } from '../../domain/analytics/evaluation';
import { equivalent10Km } from '../../domain/analytics/running';
import {
  formatDate,
  formatTime,
  formatKm,
  formatPace,
  formatDuration,
  formatHeartRate,
} from '../../components/format';
export function EvaluationPanel({
  runs,
  allRuns,
  selectedId,
  onSelect,
}: {
  runs: readonly Run[];
  allRuns: readonly Run[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const target = runs.find((run) => run.id === selectedId) ?? runs[0];
  const [report, setReport] = useState<RunEvaluation | null>(null);
  useEffect(() => setReport(null), [target, allRuns]);
  return (
    <section className="panel evaluation-panel" aria-labelledby="evaluation-title">
      <div className="panel-heading">
        <div>
          <h2 id="evaluation-title">該当日のランニング分析・アドバイス</h2>
          <p>選択した1回を、本人の過去90日の記録とブラウザ内で比較します。</p>
        </div>
      </div>
      <div className="evaluation-controls">
        <label>
          分析対象のランニング
          <select
            value={target?.id ?? ''}
            disabled={!runs.length}
            onChange={(event) => onSelect(event.target.value)}
          >
            {!runs.length && <option value="">対象の記録がありません</option>}
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {formatDate(run.startTime)} {formatTime(run.startTime)}・
                {formatKm(run.distanceMeters)} km
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button"
          disabled={!target}
          onClick={() => target && setReport(evaluateRun(target, allRuns))}
        >
          分析する
        </button>
      </div>
      <p className="evaluation-help">
        一覧の「詳細を見る」でも分析対象を選択できます。条件や記録を変更すると結果をクリアします。
      </p>
      {report && target ? (
        <div
          className="evaluation-result"
          role="region"
          aria-label="ランニングの分析結果"
          aria-live="polite"
        >
          <h3>
            {formatDate(target.startTime)} {formatTime(target.startTime)}の分析結果
          </h3>
          <p className="evaluation-score">
            総合点数（自己比較・参考）{' '}
            <strong data-testid="evaluation-score">
              {report.score === null ? '採点不可' : `${report.score} / 100点`}
            </strong>
          </p>
          <p>
            {formatKm(target.distanceMeters)} km ／ {formatDuration(target.durationSeconds)} ／{' '}
            {formatPace(target.paceSecondsPerKm)} /km ／ 平均心拍{' '}
            {formatHeartRate(target.averageHeartRateBpm)} ／ 10kmあたり{' '}
            {formatDuration(equivalent10Km(target.distanceMeters, target.durationSeconds))}
            （等速換算）
          </p>
          <h3>総括</h3>
          <p>{report.summary}</p>
          <div className="evaluation-notes">
            <div>
              <h3>良い点</h3>
              <ul>
                {report.good.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>悪い点・改善を確認する点</h3>
              <ul>
                {report.improvements.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          </div>
          <h3>アドバイス</h3>
          <ul>
            {report.advice.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <details>
            <summary>採点の根拠・比較条件</summary>
            <p>
              対象より前の90日間・別日・同じ記録元・距離±20%。屋内外が双方にある場合は一致する記録のみを使用します。表示期間・絞り込みに関係なく、保存された過去記録から比較します。同じ活動のコピーは1回だけ数えます。比較対象{' '}
              {report.referenceCount}件。
            </p>
            <div className="table-scroll">
              <table className="goal-detail-table">
                <caption>指標別の比較結果</caption>
                <thead>
                  <tr>
                    <th>指標・条件</th>
                    <th>本人 / 過去の中央値</th>
                    <th>比較件数</th>
                    <th>参考点・重み</th>
                  </tr>
                </thead>
                <tbody>
                  {report.components.map((item) => (
                    <tr key={item.name}>
                      <th>
                        {item.name}
                        <small className="column-note">{item.condition}</small>
                      </th>
                      <td>
                        {item.target === null ? 'データなし' : item.target.toFixed(1)} /{' '}
                        {item.median === null ? 'データなし' : item.median.toFixed(1)} {item.unit}
                      </td>
                      <td>{item.count}件</td>
                      <td>
                        {item.score === null
                          ? '採点不可・対象外'
                          : `${Math.round(item.score)}点・${Math.round(100 / report.components.filter((part) => part.score !== null).length)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              各指標は比較対象が3件以上の場合のみ採点します。数値が小さい方を良い側とし、参考点＝100×（本人より大きい比較値の件数＋同等件数×0.5）÷比較件数。採点できる指標を均等に平均します。0〜100点は本人内の相対比較で、医学的評価ではありません。気象・起伏・疲労・走行目的は考慮できません。
            </p>
          </details>
        </div>
      ) : (
        <p className="muted">
          {target
            ? '対象を選んで「分析する」を押してください。結果は保存されず、外部への送信も行いません。'
            : '絞り込み条件を変更するか、ランニング記録をインポートしてください。'}
        </p>
      )}
    </section>
  );
}
