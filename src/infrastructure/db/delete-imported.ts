import { db, type RunningDatabase } from './database';
export interface ImportedCounts {
  runs: number;
  routes: number;
  imports: number;
  stagedRuns: number;
  stagedRoutes: number;
}
export async function importedCounts(database: RunningDatabase = db): Promise<ImportedCounts> {
  return database.transaction(
    'r',
    database.runs,
    database.routes,
    database.imports,
    database.staging,
    database.stagingRoutes,
    async () => ({
      runs: await database.runs.count(),
      routes: await database.routes.count(),
      imports: await database.imports.count(),
      stagedRuns: await database.staging.count(),
      stagedRoutes: await database.stagingRoutes.count(),
    }),
  );
}
/** All imported data is removed atomically. Goal settings and downloaded files are preserved. */
export async function clearImportedData(database: RunningDatabase, expected: ImportedCounts) {
  return database.transaction(
    'rw',
    database.runs,
    database.routes,
    database.imports,
    database.staging,
    database.stagingRoutes,
    async () => {
      const actual = await importedCounts(database);
      if (
        (Object.keys(actual) as (keyof ImportedCounts)[]).some(
          (key) => actual[key] !== expected[key],
        )
      )
        throw new Error('データ件数が変わりました。削除対象を再確認してください。');
      await database.runs.clear();
      await database.routes.clear();
      await database.imports.clear();
      await database.staging.clear();
      await database.stagingRoutes.clear();
      return actual;
    },
  );
}
export async function deleteImportedWithLock(
  expected: ImportedCounts,
  database: RunningDatabase = db,
) {
  if (!navigator.locks)
    throw new Error('このブラウザでは安全に削除できません。最新のブラウザをご利用ください。');
  return navigator.locks.request('my-running-coach-import', { ifAvailable: true }, async (lock) => {
    if (!lock)
      throw new Error('別のタブで取り込み・復元・設定変更中です。完了してから削除してください。');
    return clearImportedData(database, expected);
  });
}
