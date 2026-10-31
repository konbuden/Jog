import { useEffect, useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import {
  deleteImportedWithLock,
  importedCounts,
  type ImportedCounts,
} from '../../infrastructure/db/delete-imported';
export function DeleteImportedData({
  onCancel,
  onBusyChange,
  onDeleted,
}: {
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
  onDeleted: (message: string) => void;
}) {
  const [counts, setCounts] = useState<ImportedCounts | null>(null),
    [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void importedCounts()
      .then((value) => {
        if (active) setCounts(value);
      })
      .catch(() => {
        if (active) setError('削除対象の件数を取得できませんでした。');
      });
    return () => {
      active = false;
    };
  }, []);
  const remove = async () => {
    if (!counts || !acknowledged) return;
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      const deleted = await deleteImportedWithLock(counts);
      onDeleted(
        `ラン${deleted.runs}件・コース${deleted.routes}件・振り返り${deleted.reviews}件と取り込み履歴・一時データを削除しました。目標設定は保持しています。元のZIPから再取り込みできます。`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === 'Error'
          ? cause.message
          : '削除に失敗しました。保存済みデータは変更していません。',
      );
      setAcknowledged(false);
      try {
        setCounts(await importedCounts());
      } catch {
        setCounts(null);
      }
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <section className="delete-imported" aria-labelledby="delete-title">
      <h3 id="delete-title">
        <AlertTriangle size={20} />
        取り込み済みデータを全削除
      </h3>
      <p>
        このブラウザに保存したすべてのラン・コース・振り返り・取り込み履歴・一時データを削除します。元に戻せません。
      </p>
      <p className="muted">
        目標設定と端末に書き出したバックアップは残ります。必要な記録は先に「目標・バックアップ」から保存してください。他の端末・ブラウザのデータは削除しません。
      </p>
      {counts ? (
        <dl>
          <div>
            <dt>ランニング</dt>
            <dd>{counts.runs.toLocaleString()}件</dd>
          </div>
          <div>
            <dt>コース</dt>
            <dd>{counts.routes.toLocaleString()}件</dd>
          </div>
          <div>
            <dt>振り返り</dt>
            <dd>{counts.reviews.toLocaleString()}件</dd>
          </div>
          <div>
            <dt>取り込み履歴</dt>
            <dd>{counts.imports.toLocaleString()}件</dd>
          </div>
        </dl>
      ) : (
        <p role="status">削除対象を確認しています…</p>
      )}
      <label className="delete-checkbox">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={!counts || busy}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        削除対象を確認しました
      </label>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="delete-actions">
        <button
          className="danger-button"
          disabled={!counts || !acknowledged || busy}
          onClick={() => void remove()}
        >
          <Trash2 size={17} />
          {busy ? '削除しています…' : '全データを削除する'}
        </button>
        <button className="secondary-button" disabled={busy} onClick={onCancel}>
          削除をキャンセル
        </button>
      </div>
    </section>
  );
}
