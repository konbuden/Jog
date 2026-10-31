import { ImportError } from '../infrastructure/apple-health/errors';
import { db, commitStaging } from '../infrastructure/db/database';
import { stageImportRuns, type ImportReceipt } from '../infrastructure/db/import-records';
import { importHealthFile } from '../infrastructure/apple-health/import-file';
import { fingerprintFile } from '../infrastructure/apple-health/file-fingerprint';
import type { ImportRequest, ImportResponse } from './messages';
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ImportRequest>) => void) | null;
  postMessage: (message: ImportResponse) => void;
  close: () => void;
};
let cancelled = false,
  started = false;
let decide: ((value: boolean) => void) | undefined;
const send = (message: ImportResponse) => scope.postMessage(message);
scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelled = true;
    decide?.(false);
  }
  if (request.type === 'confirm') decide?.(true);
  if (request.type === 'start' && !started) {
    started = true;
    void start(request.file, request.includeExistingDetails ?? false);
  }
};
async function start(file: File, includeExistingDetails: boolean) {
  try {
    if (!navigator.locks)
      throw new ImportError(
        'このブラウザは安全な取り込みの排他制御に対応していません。最新のブラウザをご利用ください。',
      );
    await navigator.locks.request(
      'my-running-coach-import',
      { ifAvailable: true },
      async (lock) => {
        if (!lock)
          throw new ImportError(
            '別のタブで取り込み・復元・削除中です。そちらを完了またはキャンセルしてください。',
          );
        try {
          await db.staging.clear();
          await db.stagingRoutes.clear();
          let lastPercent = -1;
          const fingerprint = await fingerprintFile(
            file,
            () => cancelled,
            (percent) => {
              if (percent !== lastPercent) {
                lastPercent = percent;
                send({ type: 'progress', percent, stage: 'fingerprint' });
              }
            },
          );
          const receiptId = `apple-health-import-v1:${fingerprint}`;
          const known = includeExistingDetails ? undefined : await db.imports.get(receiptId);
          let receipt: ImportReceipt;
          let duplicates = 0,
            conflicts = 0,
            newCount = 0;
          let newFirstTime: string | null = null,
            newLastTime: string | null = null;
          const enhanced = new Set<string>();
          if (known) {
            receipt = known;
            duplicates = known.validCount;
          } else {
            let validCount = 0,
              firstTime: string | null = null,
              lastTime: string | null = null;
            lastPercent = -1;
            const report = await importHealthFile(
              file,
              async (runs) => {
                for (const run of runs) {
                  validCount++;
                  if (firstTime === null || run.startTime < firstTime) firstTime = run.startTime;
                  if (lastTime === null || run.startTime > lastTime) lastTime = run.startTime;
                }
                const result = await stageImportRuns(db, runs, includeExistingDetails);
                newCount += result.added;
                duplicates += result.duplicates;
                conflicts += result.conflicts;
                for (const id of result.enhanced) enhanced.add(id);
                if (result.firstTime && (newFirstTime === null || result.firstTime < newFirstTime))
                  newFirstTime = result.firstTime;
                if (result.lastTime && (newLastTime === null || result.lastTime > newLastTime))
                  newLastTime = result.lastTime;
                return result.routeTargets;
              },
              (percent) => {
                if (percent !== lastPercent) {
                  lastPercent = percent;
                  send({ type: 'progress', percent, stage: 'parsing' });
                }
              },
              () => cancelled,
              async (route) => {
                if (await db.routes.get(route.id)) return;
                await db.stagingRoutes.put(route);
                if (await db.runs.get(route.id)) enhanced.add(route.id);
              },
            );
            receipt = {
              id: receiptId,
              inputBytes: file.size,
              importedAt: new Date().toISOString(),
              validCount,
              firstTime,
              lastTime,
              report,
            };
          }
          if (cancelled) {
            send({ type: 'cancelled' });
            return;
          }
          // Only cache a no-op when every applicable record is already stored and no changes are pending.
          if (!known && !newCount && !enhanced.size && !conflicts && receipt.validCount > 0)
            await db.imports.put(receipt);
          const decision = new Promise<boolean>((resolve) => {
            decide = resolve;
          });
          send({
            type: 'preview',
            preview: {
              ...receipt.report,
              newCount,
              duplicates,
              conflicts,
              enhancedCount: enhanced.size,
              firstTime: receipt.firstTime,
              lastTime: receipt.lastTime,
              newFirstTime,
              newLastTime,
              fileAlreadyImported: Boolean(known),
            },
          });
          if (await decision) {
            if (known) {
              send({ type: 'complete', added: 0, duplicates, conflicts: 0, updated: 0 });
              return;
            }
            const result = await commitStaging(db, includeExistingDetails, receipt);
            send({
              type: 'complete',
              ...result,
              duplicates,
              conflicts: conflicts + result.conflicts,
            });
          } else send({ type: 'cancelled' });
        } finally {
          await db.staging.clear();
          await db.stagingRoutes.clear();
          decide = undefined;
        }
      },
    );
  } catch (error) {
    send(
      cancelled
        ? { type: 'cancelled' }
        : {
            type: 'error',
            message:
              error instanceof ImportError
                ? error.message
                : '取り込みに失敗しました。ファイル形式とブラウザの保存容量を確認してください。',
          },
    );
  } finally {
    db.close();
    scope.close();
  }
}
