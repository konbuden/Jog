import { useEffect, useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Run } from '../../domain/models/run';
import { emptyReview, type RunReview } from '../../domain/models/review';
import { evaluateRun, type RunEvaluation } from '../../domain/analytics/evaluation';
import { parseLaps, lapsText, validateReview } from '../../domain/analytics/review';
import { db } from '../../infrastructure/db/database';
import { saveReviewWithLock } from '../../infrastructure/db/reviews';
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
  monthlyGoalKm = 100,
  embedded = false,
}: {
  runs: readonly Run[];
  allRuns: readonly Run[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  monthlyGoalKm?: number;
  embedded?: boolean;
}) {
  const target = runs.find((run) => run.id === selectedId) ?? runs[0],
    titleId = useId();
  const loaded = useLiveQuery(async () => {
    try {
      return {
        runId: target?.id,
        review: target ? await db.runReviews.get(target.id) : undefined,
        error: false,
      };
    } catch {
      return { runId: target?.id, review: undefined, error: true };
    }
  }, [target?.id]);
  return (
    <section className="panel evaluation-panel" aria-labelledby={titleId}>
      <div className="panel-heading">
        <div>
          <h2 id={titleId}>該当日のランニング分析・アドバイス</h2>
          <p>10km走行能力・ペース管理能力・運動中の余力を、記録と本人の振り返りから確認します。</p>
        </div>
      </div>
      {!embedded && (
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
        </div>
      )}
      {!target ? (
        <div className="evaluation-help">
          <p>対象の記録がありません。絞り込み条件を変更するか記録をインポートしてください。</p>
          <button className="primary-button" disabled>
            分析する
          </button>
        </div>
      ) : !loaded || loaded.runId !== target.id ? (
        <p className="evaluation-help" role="status">
          振り返りを読み込んでいます…
        </p>
      ) : loaded.error ? (
        <p className="error-message" role="alert">
          保存済み振り返りを読み込めません。保存領域を確認して再読み込みしてください。
        </p>
      ) : (
        <RunEvaluationEditor
          key={target.id}
          run={target}
          history={allRuns}
          saved={loaded.review}
          monthlyGoalKm={monthlyGoalKm}
        />
      )}
    </section>
  );
}
function RunEvaluationEditor({
  run,
  history,
  saved,
  monthlyGoalKm,
}: {
  run: Run;
  history: readonly Run[];
  saved: RunReview | undefined;
  monthlyGoalKm: number;
}) {
  const makeForm = (review: RunReview) => ({ review, lapText: lapsText(review.laps) });
  const [base, setBase] = useState(() => makeForm(saved ?? emptyReview(run.id))),
    [form, setForm] = useState(base);
  const [result, setResult] = useState<{
      report: RunEvaluation;
      run: Run;
      history: readonly Run[];
      goal: number;
    } | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(base),
    stale = (saved?.revision ?? '') !== base.review.revision;
  const loadSaved = () => {
    const next = makeForm(saved ?? emptyReview(run.id));
    setBase(next);
    setForm(next);
    setResult(null);
    setError('');
    setMessage('保存済みの振り返りを読み込みました。');
  };
  useEffect(() => {
    if (!dirty) {
      const next = makeForm(saved ?? emptyReview(run.id));
      setBase(next);
      setForm(next);
      setResult(null);
    }
  }, [saved?.revision]);
  const change = (patch: Partial<RunReview>) => {
    setForm((current) => ({ ...current, review: { ...current.review, ...patch } }));
    setResult(null);
    setError('');
    setMessage('');
  };
  const candidate = () => {
    const review = { ...form.review, laps: parseLaps(form.lapText, run) };
    const invalid = validateReview(review, run);
    if (invalid) throw new Error(invalid);
    return review;
  };
  const analyze = () => {
    setError('');
    try {
      if (stale)
        throw new Error('保存済み振り返りが更新されています。読み直してから分析してください。');
      setResult({
        report: evaluateRun(run, history, candidate(), monthlyGoalKm),
        run,
        history,
        goal: monthlyGoalKm,
      });
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : '分析できませんでした。');
    }
  };
  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const next = await saveReviewWithLock(candidate(), base.review.revision || null);
      const nextForm = makeForm(next);
      setBase(nextForm);
      setForm(nextForm);
      setResult(null);
      setMessage('振り返りを保存しました。両画面とバックアップで利用できます。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '振り返りを保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };
  const report =
    !stale && result?.run === run && result.history === history && result.goal === monthlyGoalKm
      ? result.report
      : null;
  const options = <T extends string>(
    label: string,
    key: keyof RunReview,
    values: readonly [T, string][],
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={String(form.review[key])}
        disabled={saving}
        onChange={(event) => change({ [key]: event.target.value })}
      >
        {values.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="evaluation-editor">
      <details className="review-form">
        <summary>振り返り・区間ラップを入力する（任意）</summary>
        <p>
          記録にない意図・体感・翌日の状態を補います。健康情報はこのブラウザ内だけに保存します。
        </p>
        <div className="review-fields">
          {options('走行目的', 'purpose', [
            ['unknown', '未確認'],
            ['easy', '楽なジョグ'],
            ['steady', '一定のペースで走る'],
            ['progressive', '徐々に負荷を上げる'],
            ['interval', 'インターバル'],
          ])}
          <label>
            終了時のきつさ（RPE 1〜10）
            <input
              aria-label="終了時のきつさ（RPE 1〜10）"
              type="number"
              min="1"
              max="10"
              step="1"
              placeholder="未確認"
              value={form.review.rpe ?? ''}
              disabled={saving}
              onChange={(event) =>
                change({ rpe: event.target.value === '' ? null : Number(event.target.value) })
              }
            />
            <small>1：非常に楽 ／ 10：最大努力</small>
          </label>
          {options('終盤のペース変更の意図', 'lateIntent', [
            ['unknown', '未確認'],
            ['ease', '意図的に負荷を下げた'],
            ['push', '意図的に加速した'],
            ['steady', '一定に保つつもりだった'],
          ])}
          {options('追加2〜3kmを走る余裕', 'extraDistance', [
            ['unknown', '未確認'],
            ['yes', '余裕があった'],
            ['no', '余裕はなかった'],
          ])}
          {options('翌朝の疲労', 'nextDay', [
            ['unknown', 'まだ未確認'],
            ['normal', '普段どおり'],
            ['tired', '疲労が残っている'],
          ])}
          {options('走行後の違和感', 'discomfort', [
            ['unknown', '未確認'],
            ['none', '特になし'],
            ['present', '違和感がある'],
          ])}
        </div>
        <label className="lap-input">
          区間ラップ（本人入力）
          <textarea
            aria-label="区間ラップ（本人入力）"
            rows={6}
            maxLength={20000}
            disabled={saving}
            value={form.lapText}
            placeholder="1, 6:00, 130, 200"
            onChange={(event) => {
              setForm((current) => ({ ...current, lapText: event.target.value }));
              setResult(null);
              setError('');
              setMessage('');
            }}
          />
        </label>
        <p className="review-hint">
          1行1区間。距離km, 時間m:ssまたはh:mm:ss, 平均心拍bpm（任意）,
          平均パワーW（任意）。元のラップを確認し、最初から最後まで入力してください。最大100区間。現行XMLから区間値は自動取得していません。距離合計は100mまたは2%、時間合計は30秒または5%までの差を許容します。
        </p>
        <div className="review-actions">
          <button
            className="secondary-button"
            disabled={saving || stale}
            onClick={() => void save()}
          >
            {saving ? '保存しています…' : '振り返りを保存する'}
          </button>
          <button className="text-button" disabled={saving} onClick={loadSaved}>
            保存済み内容を読み直す
          </button>
          <span>
            {dirty
              ? '未保存の変更があります。分析には入力中の内容を使います。'
              : '保存ボタンでこのランに紐付けて保持します。'}
          </span>
        </div>
      </details>
      {stale && (
        <p role="alert" className="notice">
          別の画面で振り返りが更新されています。「保存済み内容を読み直す」で確認してください。
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="evaluation-controls">
        <button className="primary-button" disabled={saving || stale} onClick={analyze}>
          分析する
        </button>
        <span>条件や入力を変えると結果をクリアします。結果は保存・外部送信しません。</span>
      </div>
      {report ? (
        <div
          className="evaluation-result"
          role="region"
          aria-label="ランニングの分析結果"
          aria-live="polite"
        >
          <h3>
            {formatDate(run.startTime)} {formatTime(run.startTime)}の分析結果
          </h3>
          <p className="evaluation-score">
            総合参考点{' '}
            <strong data-testid="evaluation-score">
              {report.score === null
                ? `評価保留（${report.available}/3観点）`
                : `${report.score} / 100点`}
            </strong>
          </p>
          <p>
            完走・中盤の安定・本人申告の余力の参考評価です。3観点の根拠が揃う場合のみ集計します。練習の価値や健康状態の点数ではありません。
          </p>
          <p>
            {formatKm(run.distanceMeters)}km ／ {formatDuration(run.durationSeconds)} ／{' '}
            {formatPace(run.paceSecondsPerKm)}/km ／ 平均心拍{' '}
            {formatHeartRate(run.averageHeartRateBpm)} ／ 10km等速換算{' '}
            {formatDuration(report.equivalent10KmSeconds)}
          </p>
          <p>
            平均パワー：
            {run.details?.averagePowerWatts === undefined
              ? 'データなし'
              : `${run.details.averagePowerWatts.toFixed(0)} W`}{' '}
            ／ 平均ケイデンス：
            {run.details?.averageCadenceSpm === undefined
              ? 'データなし'
              : `${run.details.averageCadenceSpm.toFixed(0)} 歩/分`}
            。追加指標も元データがある場合だけ表示します。
          </p>
          <div className="evaluation-axis-grid">
            {report.axes.map((axis) => (
              <article key={axis.key} className="evaluation-axis">
                <h3>{axis.name}</h3>
                <strong>{axis.assessment}</strong>
                <p>{axis.basis}</p>
                <small>
                  {axis.score === null
                    ? '参考点：保留'
                    : `参考点 ${Math.round(axis.score)} / 100・総合の重み${axis.weight}%`}
                </small>
              </article>
            ))}
          </div>
          <h3>総括</h3>
          <p>{report.summary}</p>
          <h3>今回の走りの観測</h3>
          {report.observations.length ? (
            <ul>
              {report.observations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : (
            <p>
              区間ラップと同距離帯の過去記録が不足しています。取得済みの全体値だけを表示しています。
            </p>
          )}
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
          <h3>翌日回復の確認</h3>
          <p>{report.recovery}</p>
          <h3>アドバイス</h3>
          <ul>
            {report.advice.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <details>
            <summary>採点の根拠・比較条件</summary>
            <p>
              10km走行能力は今回10km以上を完走した実績の基準充足を100点とし、速さの優劣は採点しません。ペース管理は区間中心が走行距離20〜80%にある中盤2区間以上の距離加重ペース変動係数CVを使い、100/(1+10×CV)点。インターバルは対象外。余力は本人申告のRPEから100×(10−RPE)/9点。不一致や違和感の申告がある場合は保留します。3観点が揃う場合のみ40%・30%・30%で集計して丸めます。点数の計算式は説明用の目安で、妥当性が検証された走力・医学的モデルではありません。
            </p>
            <p>
              過去比較：対象より前90日以内・別日・同じ記録元。双方の屋内外が既知なら一致。コピーを除いた過去記録
              {report.referenceCount}
              件から、距離±20%の直近5件を表示します。表示期間の絞り込み前の全記録を使用します。
            </p>
            <div className="table-scroll">
              <table className="goal-detail-table">
                <caption>同距離帯の推移と今回</caption>
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>実走距離</th>
                    <th>平均ペース</th>
                    <th>10km等速換算</th>
                    <th>平均心拍</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.previous]
                    .reverse()
                    .concat(run)
                    .map((item) => (
                      <tr key={item.id}>
                        <th>
                          {formatDate(item.startTime)} {formatTime(item.startTime)}
                          {item.id === run.id ? '（今回）' : ''}
                        </th>
                        <td>{formatKm(item.distanceMeters)}km</td>
                        <td>{formatPace(item.paceSecondsPerKm)}/km</td>
                        <td>
                          {formatDuration(
                            equivalent10Km(item.distanceMeters, item.durationSeconds),
                          )}
                        </td>
                        <td>{formatHeartRate(item.averageHeartRateBpm)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p>
              10km等速換算は完走予測ではありません。区間ラップ・意図・体感は本人入力。全体統計はApple
              HealthのWorkout。平均心拍やWorkout内の最高心拍だけで余力・個人の最大心拍・翌日回復力を推定しません。気温・地形・計測条件は不明なら原因を断定しません。
            </p>
          </details>
        </div>
      ) : (
        <p className="evaluation-help">
          「分析する」を押してください。任意の振り返りを入力すると、意図・余力・翌日の回復を含めて確認できます。未確認の項目は推測しません。
        </p>
      )}
    </div>
  );
}
