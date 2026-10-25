import { db } from '../infrastructure/db/database';
import { exportBackup, previewBackup, restoreBackup } from '../infrastructure/backup/service';
import { readBackup } from '../infrastructure/backup/format';
import type { BackupRequest, BackupResponse } from './backup-messages';
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BackupRequest>) => void) | null;
  postMessage: (value: BackupResponse) => void;
  close: () => void;
};
let started = false,
  cancelled = false,
  decide: ((value: boolean | null) => void) | undefined;
scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelled = true;
    decide?.(null);
  }
  if (request.type === 'confirm') decide?.(request.restoreGoals);
  if ((request.type === 'export' || request.type === 'restore') && !started) {
    started = true;
    void start(request);
  }
};
async function start(request: Extract<BackupRequest, { type: 'export' | 'restore' }>) {
  try {
    if (!navigator.locks)
      throw new Error(
        'このブラウザは安全なバックアップ処理に対応していません。最新のブラウザをご利用ください。',
      );
    await navigator.locks.request(
      'my-running-coach-import',
      { ifAvailable: true },
      async (lock) => {
        if (!lock)
          throw new Error('別のタブで取り込み・復元・設定変更中です。完了してからお試しください。');
        if (request.type === 'export') {
          const result = await exportBackup(db);
          if (cancelled) scope.postMessage({ type: 'cancelled' });
          else scope.postMessage({ type: 'exported', ...result });
          return;
        }
        const snapshot = await readBackup(request.file),
          preview = await previewBackup(db, snapshot);
        if (cancelled) {
          scope.postMessage({ type: 'cancelled' });
          return;
        }
        const decision = new Promise<boolean | null>((resolve) => {
          decide = resolve;
        });
        scope.postMessage({ type: 'preview', preview, goals: snapshot.goals });
        const restoreGoals = await decision;
        if (restoreGoals === null) {
          scope.postMessage({ type: 'cancelled' });
          return;
        }
        const result = await restoreBackup(db, snapshot, restoreGoals);
        scope.postMessage({ type: 'complete', ...result });
      },
    );
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message:
        error instanceof Error && error.name === 'Error'
          ? error.message
          : 'バックアップ処理に失敗しました。保存容量を確認してください。',
    });
  } finally {
    db.close();
    scope.close();
  }
}
