import { ImportError } from '../infrastructure/apple-health/errors';
import { db, commitStaging, sameRun, canEnrich } from '../infrastructure/db/database';
import { importHealthFile } from '../infrastructure/apple-health/import-file';
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
    void start(request.file);
  }
};

async function start(file: File) {
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
            '別のタブで取り込み中です。そちらを完了またはキャンセルしてください。',
          );
        try {
          await db.staging.clear();
          await db.stagingRoutes.clear();
          const enhanced = new Set<string>(),
            eligibleRoutes = new Set<string>();
          let duplicates = 0,
            conflicts = 0,
            newCount = 0;
          let firstTime: string | null = null,
            lastTime: string | null = null;
          let lastPercent = -1;
          const report = await importHealthFile(
            file,
            async (runs) => {
              await db.transaction('rw', db.staging, db.runs, async () => {
                for (const run of runs) {
                  firstTime =
                    firstTime === null || run.startTime < firstTime ? run.startTime : firstTime;
                  lastTime =
                    lastTime === null || run.startTime > lastTime ? run.startTime : lastTime;
                  const existing = (await db.staging.get(run.id)) ?? (await db.runs.get(run.id));
                  if (existing) {
                    duplicates++;
                    if (!sameRun(existing, run)) conflicts++;
                    else {
                      if (run.details?.routeFiles?.length) eligibleRoutes.add(run.id);
                      if (canEnrich(existing, run)) {
                        await db.staging.put({
                          ...run,
                          details: { ...run.details, ...existing.details },
                        });
                        if (await db.runs.get(run.id)) enhanced.add(run.id);
                      }
                    }
                  } else {
                    if (run.details?.routeFiles?.length) eligibleRoutes.add(run.id);
                    await db.staging.add(run);
                    newCount++;
                  }
                }
              });
            },
            (percent) => {
              if (percent !== lastPercent) {
                lastPercent = percent;
                send({ type: 'progress', percent });
              }
            },
            () => cancelled,
            async (route) => {
              if (!eligibleRoutes.has(route.id) || (await db.routes.get(route.id))) return;
              await db.stagingRoutes.put(route);
              if (await db.runs.get(route.id)) enhanced.add(route.id);
            },
          );
          if (cancelled) {
            send({ type: 'cancelled' });
            return;
          }
          const decision = new Promise<boolean>((resolve) => {
            decide = resolve;
          });
          send({
            type: 'preview',
            preview: {
              ...report,
              newCount,
              duplicates,
              conflicts,
              enhancedCount: enhanced.size,
              firstTime,
              lastTime,
            },
          });
          if (await decision) {
            const result = await commitStaging();
            send({
              type: 'complete',
              ...result,
              duplicates,
              conflicts,
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
