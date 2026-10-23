import { useEffect, useRef, useState } from 'react';
import { Check, FileUp, ShieldCheck, X, AlertCircle } from 'lucide-react';
import type { ImportPreview, ImportRequest, ImportResponse } from '../../workers/messages';
import { formatDate } from '../../components/format';
import {
  IMPORT_EXPANDED_MAX_GB,
  IMPORT_FILE_MAX_MB,
} from '../../infrastructure/apple-health/import-limits';

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const worker = useRef<Worker | null>(null);
  const [phase, setPhase] = useState<
    'select' | 'parsing' | 'preview' | 'saving' | 'complete' | 'error'
  >('select');
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [fileName, setFileName] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      worker.current?.terminate();
      element?.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  const send = (message: ImportRequest) => worker.current?.postMessage(message);
  const close = () => {
    if (phase === 'saving') return;
    if (phase === 'parsing' || phase === 'preview') {
      setCancelling(true);
      send({ type: 'cancel' });
    } else onClose();
  };
  const select = (file: File) => {
    worker.current?.terminate();
    setFileName(file.name);
    setProgress(0);
    setPhase('parsing');
    setCancelling(false);
    try {
      const instance = new Worker(new URL('../../workers/import.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<ImportResponse>) => {
        const message = event.data;
        if (message.type === 'progress') setProgress(message.percent);
        if (message.type === 'preview') {
          setPreview(message.preview);
          setPhase('preview');
        }
        if (message.type === 'complete') {
          setResult(
            `${message.added}件を保存しました。重複${message.duplicates}件${message.conflicts ? `（内容の差異${message.conflicts}件・既存値を保持）` : ''}。`,
          );
          setPhase('complete');
        }
        if (message.type === 'cancelled') onClose();
        if (message.type === 'error') {
          setError(message.message);
          setPhase('error');
        }
      };
      instance.onerror = () => {
        setError('取り込み処理を起動できませんでした。ブラウザを更新して再度お試しください。');
        setPhase('error');
        instance.terminate();
      };
      send({ type: 'start', file });
    } catch {
      setError('Web Workerを利用できません。最新のブラウザでお試しください。');
      setPhase('error');
    }
  };

  return (
    <dialog
      ref={dialog}
      className="import-dialog"
      aria-labelledby="import-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-heading">
        <div className="eyebrow">APPLE HEALTH</div>
        <button
          className="icon-button"
          aria-label="閉じる"
          onClick={close}
          disabled={phase === 'saving' || cancelling}
        >
          <X size={20} />
        </button>
      </div>
      <h2 id="import-title">ランニングデータをインポート</h2>
      <p className="muted">Apple Healthの記録を、あなたのランニングノートへ。</p>
      {(phase === 'select' || phase === 'error') && (
        <>
          <label className="file-drop">
            <FileUp size={32} />
            <strong>ZIP / export.xmlを選択</strong>
            <span>ZIP・XMLともに{IMPORT_FILE_MAX_MB} MBまで</span>
            <span>ZIP展開後のXMLは{IMPORT_EXPANDED_MAX_GB} GBまで</span>
            <input
              type="file"
              accept=".zip,.xml"
              aria-label="Apple Healthファイル"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) select(file);
              }}
            />
          </label>
          <details>
            <summary>Apple Healthからの書き出し方法</summary>
            <p>
              iPhoneの「ヘルスケア」→プロフィール→「すべてのヘルスケアデータを書き出す」でZIPを保存し、この画面で選択してください。
            </p>
          </details>
        </>
      )}
      {phase === 'parsing' && (
        <div className="import-progress" role="status">
          <FileUp size={32} />
          <strong>{cancelling ? 'キャンセルしています…' : 'データを解析しています…'}</strong>
          <span className="file-name">{fileName}</span>
          <progress aria-label="解析の進捗" value={progress} max={100} />
          <span>{progress}%</span>
        </div>
      )}
      {phase === 'preview' && preview && (
        <div className="import-preview">
          <h3>保存前の確認</h3>
          <div className="preview-counts">
            <div>
              <strong>{preview.newCount}</strong>
              <span>新規</span>
            </div>
            <div>
              <strong>{preview.duplicates}</strong>
              <span>重複</span>
            </div>
            <div>
              <strong>{preview.excluded}</strong>
              <span>除外</span>
            </div>
          </div>
          <p>
            対象期間：
            {preview.firstTime && preview.lastTime
              ? `${formatDate(preview.firstTime)} 〜 ${formatDate(preview.lastTime)}`
              : '有効なランニングなし'}
          </p>
          <p className="muted">
            ランニング {preview.runningCount}件を検出。他のワークアウト {preview.ignoredWorkouts}
            件は対象外です。
          </p>
          {preview.conflicts > 0 && (
            <p className="notice">
              重複のうち{preview.conflicts}件に内容の差があります。既存の記録を保持します。
            </p>
          )}
          {Object.keys(preview.warnings).length > 0 && (
            <div className="notice">
              <strong>確認が必要なデータ</strong>
              <ul>
                {Object.entries(preview.warnings).map(([message, count]) => (
                  <li key={message}>
                    {message}：{count}件
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="muted">
            心拍はWorkout内に平均値がある場合のみ保存します。ここではまだ記録は追加されていません。
          </p>
          <button
            className="primary-button"
            disabled={preview.newCount === 0 || cancelling}
            onClick={() => {
              setPhase('saving');
              send({ type: 'confirm' });
            }}
          >
            <Check size={17} />
            {preview.newCount}件を保存する
          </button>
        </div>
      )}
      {phase === 'saving' && <p role="status">記録を保存しています。このままお待ちください。</p>}
      {phase === 'complete' && (
        <div className="success-message" role="status">
          <Check size={32} />
          <h3>インポートが完了しました</h3>
          <p>{result}</p>
          <button className="primary-button" onClick={onClose}>
            記録を見る
          </button>
        </div>
      )}
      {phase === 'error' && (
        <p role="alert" className="error-message">
          <AlertCircle size={18} />
          {error}
        </p>
      )}
      <div className="privacy-note">
        <ShieldCheck size={17} />
        <span>データはこのブラウザ内だけで処理・保存されます。</span>
      </div>
      {(phase === 'parsing' || phase === 'preview') && (
        <button className="text-button" onClick={close} disabled={cancelling}>
          キャンセル
        </button>
      )}
    </dialog>
  );
}
