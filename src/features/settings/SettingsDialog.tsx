import { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Flag, Save, X } from 'lucide-react';
import type { Run } from '../../domain/models/run';
import type { GoalSettings } from '../../domain/models/goals';
import { validateGoals } from '../../domain/models/goals';
import { db } from '../../infrastructure/db/database';
import { dateKey } from '../../domain/analytics/time';
import { formatDate } from '../../components/format';
import type { BackupRequest, BackupResponse } from '../../workers/backup-messages';
import type { RestorePreview } from '../../infrastructure/backup/service';
import { GoalProgress } from './GoalProgress';

type Phase = 'idle' | 'exporting' | 'parsing' | 'preview' | 'restoring' | 'done' | 'error';
export function SettingsDialog({
  goals,
  runs,
  onClose,
}: {
  goals: GoalSettings;
  runs: readonly Run[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    worker = useRef<Worker | null>(null);
  const [tab, setTab] = useState<'goals' | 'backup'>('goals');
  const [monthly, setMonthly] = useState(String(goals.monthlyDistanceKm)),
    [weekly, setWeekly] = useState(
      goals.weeklyRunCount === null ? '' : String(goals.weeklyRunCount),
    ),
    [annual, setAnnual] = useState(
      goals.annualDistanceKm === null ? '' : String(goals.annualDistanceKm),
    );
  const [saving, setSaving] = useState(false),
    [phase, setPhase] = useState<Phase>('idle'),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState<RestorePreview | null>(null),
    [backupGoals, setBackupGoals] = useState<GoalSettings | null>(null),
    [restoreGoals, setRestoreGoals] = useState(true);
  const busy = ['exporting', 'parsing', 'preview', 'restoring'].includes(phase),
    locked = saving || phase === 'restoring';
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      worker.current?.terminate();
      dialog.current?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    setMonthly(String(goals.monthlyDistanceKm));
    setWeekly(goals.weeklyRunCount === null ? '' : String(goals.weeklyRunCount));
    setAnnual(goals.annualDistanceKm === null ? '' : String(goals.annualDistanceKm));
  }, [goals.monthlyDistanceKm, goals.weeklyRunCount, goals.annualDistanceKm, goals.updatedAt]);
  const close = () => {
    if (!locked) onClose();
  };
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setPhase('idle');
    setPreview(null);
    setError('');
    setMessage('処理をキャンセルしました。保存済みデータは変更していません。');
  };
  const download = (blob: Blob, at: string) => {
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `my-running-coach-backup-${dateKey(at)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const start = (request: Extract<BackupRequest, { type: 'export' | 'restore' }>) => {
    worker.current?.terminate();
    setError('');
    setMessage('');
    setPreview(null);
    setRestoreGoals(true);
    setPhase(request.type === 'export' ? 'exporting' : 'parsing');
    try {
      const instance = new Worker(new URL('../../workers/backup.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<BackupResponse>) => {
        const response = event.data;
        if (response.type === 'exported') {
          download(response.blob, response.exportedAt);
          setPhase('done');
          setMessage(
            `バックアップを書き出しました。ラン${response.runCount}件・コース${response.routeCount}件・目標設定を含みます。`,
          );
        }
        if (response.type === 'preview') {
          setPreview(response.preview);
          setBackupGoals(response.goals);
          setPhase('preview');
        }
        if (response.type === 'complete') {
          setPhase('done');
          setMessage(
            `復元しました。追加${response.added}件・重複${response.duplicates}件・詳細追加${response.updated}件・コース追加${response.routesAdded}件・振り返り追加${response.reviewsAdded}件。${response.conflicts ? `主要数値の相違${response.conflicts}件は既存値を保持しました。` : ''}${response.goalsRestored ? '目標設定も復元しました。' : '目標設定は変更していません。'}`,
          );
          setPreview(null);
        }
        if (response.type === 'error') {
          setError(response.message);
          setPhase('error');
        }
        if (response.type === 'cancelled') cancel();
      };
      instance.onerror = () => {
        setError(
          'バックアップ処理を実行できませんでした。ブラウザの保存容量とファイルを確認してください。',
        );
        setPhase('error');
        instance.terminate();
      };
      instance.postMessage(request);
    } catch {
      setError('バックアップ用のWeb Workerを起動できません。ブラウザを更新してください。');
      setPhase('error');
    }
  };
  const saveGoals = async () => {
    const next: GoalSettings = {
      id: 'goals',
      monthlyDistanceKm: Number(monthly),
      weeklyRunCount: weekly.trim() === '' ? null : Number(weekly),
      annualDistanceKm: annual.trim() === '' ? null : Number(annual),
      updatedAt: new Date().toISOString(),
    };
    const invalid = validateGoals(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (!navigator.locks)
        throw new Error(
          'このブラウザでは設定を安全に保存できません。最新のブラウザをご利用ください。',
        );
      await navigator.locks.request(
        'my-running-coach-import',
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new Error('別のタブで取り込み・復元中です。完了してから保存してください。');
          await db.settings.put(next);
        },
      );
      setMessage('目標を保存しました。過去を含む全期間の達成率に反映します。');
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === 'Error'
          ? cause.message
          : '目標を保存できませんでした。ブラウザの保存容量を確認してください。',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="import-dialog settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-heading">
        <div className="eyebrow">MY RUNNING COACH</div>
        <button className="icon-button" aria-label="設定を閉じる" disabled={locked} onClick={close}>
          <X size={20} />
        </button>
      </div>
      <h2 id="settings-title">目標・バックアップ</h2>
      <div className="settings-switch" role="group" aria-label="設定の項目">
        <button
          aria-pressed={tab === 'goals'}
          disabled={busy || saving}
          onClick={() => {
            setTab('goals');
            setError('');
            setMessage('');
          }}
        >
          目標設定
        </button>
        <button
          aria-pressed={tab === 'backup'}
          disabled={busy || saving}
          onClick={() => {
            setTab('backup');
            setError('');
            setMessage('');
          }}
        >
          バックアップ
        </button>
      </div>
      {tab === 'goals' ? (
        <section aria-label="目標設定">
          <p className="muted">
            全期間に共通の目標です。変更すると過去月の達成率も再計算します。空欄にした任意目標は表示しません。
          </p>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void saveGoals();
            }}
          >
            <div className="settings-fields">
              <label>
                月間距離（km）
                <input
                  aria-label="月間距離目標"
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  max="100000"
                  step="0.1"
                  value={monthly}
                  onChange={(event) => setMonthly(event.target.value)}
                  disabled={saving}
                />
              </label>
              <label>
                週間回数（任意）
                <input
                  aria-label="週間回数目標"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="100"
                  step="1"
                  value={weekly}
                  placeholder="設定しない"
                  onChange={(event) => setWeekly(event.target.value)}
                  disabled={saving}
                />
              </label>
              <label>
                年間距離（km・任意）
                <input
                  aria-label="年間距離目標"
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  max="1000000"
                  step="0.1"
                  value={annual}
                  placeholder="設定しない"
                  onChange={(event) => setAnnual(event.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
            <button className="primary-button" disabled={saving}>
              <Flag size={16} />
              {saving ? '保存しています…' : '目標を保存する'}
            </button>
          </form>
          <GoalProgress runs={runs} goals={goals} />
        </section>
      ) : (
        <section aria-label="バックアップ操作">
          <p className="backup-privacy">
            健康・位置情報を含む平文のJSONファイルです。保存先と共有範囲を確認してください。外部サーバーには送信しません。
          </p>
          <div className="backup-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => start({ type: 'export' })}
            >
              <Download size={17} />
              バックアップを書き出す
            </button>
            <label className={`secondary-button backup-file${busy ? ' disabled' : ''}`}>
              <FileUp size={17} />
              バックアップから復元
              <input
                aria-label="バックアップJSON"
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) start({ type: 'restore', file });
                  event.target.value = '';
                }}
              />
            </label>
          </div>
          <p className="muted backup-help">
            書き出し対象はラン・追加指標・コース・振り返り・目標設定。元のXML/ZIP/GPXは含めません。JSONは200
            MBまで対応します。iPhoneでプレビューされた場合は共有メニューから「ファイルに保存」を選択してください。
          </p>
          {phase === 'exporting' && (
            <p role="status" className="backup-status">
              バックアップを作成しています…
            </p>
          )}
          {phase === 'parsing' && (
            <p role="status" className="backup-status">
              バックアップを検証しています…まだ保存していません。
            </p>
          )}
          {phase === 'restoring' && (
            <p role="status" className="backup-status">
              復元しています。このままお待ちください。
            </p>
          )}
          {phase === 'preview' && preview && (
            <div className="backup-preview">
              <h3>復元前の確認</h3>
              <dl>
                <div>
                  <dt>新規追加</dt>
                  <dd>{preview.newCount}件</dd>
                </div>
                <div>
                  <dt>重複</dt>
                  <dd>{preview.duplicates}件</dd>
                </div>
                <div>
                  <dt>振り返り（不足分を追加）</dt>
                  <dd>
                    {preview.newReviewCount}件 / 含まれる振り返り{preview.reviewCount}件
                  </dd>
                </div>
                <div>
                  <dt>既存への詳細追加</dt>
                  <dd>{preview.enhancedCount}件</dd>
                </div>
                <div>
                  <dt>コース追加</dt>
                  <dd>{preview.newRouteCount}件</dd>
                </div>
              </dl>
              <p>
                対象期間：
                {preview.from && preview.through
                  ? `${formatDate(preview.from)} 〜 ${formatDate(preview.through)}`
                  : '記録なし'}
              </p>
              <p>
                書き出し日時：
                {new Intl.DateTimeFormat('ja-JP', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Asia/Tokyo',
                }).format(new Date(preview.exportedAt))}
                （日本時間） ／ ラン{preview.runCount}件・コース
                {preview.routeCount}件
              </p>
              {preview.conflicts > 0 && (
                <p className="notice">
                  主要数値が異なる{preview.conflicts}件は、現在の記録を保持します。
                </p>
              )}
              <p className="muted">
                現在の記録は削除せず、不足する記録・詳細・コースだけを追加します。ここではまだ保存していません。
              </p>
              <label className="backup-checkbox">
                <input
                  type="checkbox"
                  checked={restoreGoals}
                  onChange={(event) => setRestoreGoals(event.target.checked)}
                />
                バックアップの目標設定も復元する
              </label>
              {backupGoals && (
                <p className="muted">
                  月間{backupGoals.monthlyDistanceKm} km・週間
                  {backupGoals.weeklyRunCount === null
                    ? '未設定'
                    : `${backupGoals.weeklyRunCount}回`}
                  ・年間
                  {backupGoals.annualDistanceKm === null
                    ? '未設定'
                    : `${backupGoals.annualDistanceKm}km`}
                </p>
              )}
              <button
                className="primary-button"
                onClick={() => {
                  setPhase('restoring');
                  worker.current?.postMessage({
                    type: 'confirm',
                    restoreGoals,
                  } satisfies BackupRequest);
                }}
              >
                <Save size={17} />
                確認した内容を復元する
              </button>
            </div>
          )}
          {busy && phase !== 'restoring' && (
            <button className="text-button backup-cancel" onClick={cancel}>
              バックアップ処理をキャンセル
            </button>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="settings-message">
          {message}
        </p>
      )}
    </dialog>
  );
}
