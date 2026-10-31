import { test, expect, type Page } from '../helpers/test';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { baseXml, detailedXml, gpx } from '../fixtures/synthetic/details';
import { syntheticBackup } from '../fixtures/synthetic/backup';
import { isExternalRequest } from '../helpers/is-external-request';
async function load(page: Page, details = false) {
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await page.getByLabel('Apple Healthファイル').setInputFiles({
    name: details ? 'synthetic.zip' : 'export.xml',
    mimeType: details ? 'application/zip' : 'text/xml',
    buffer: details
      ? Buffer.from(
          zipSync({
            'apple_health_export/export.xml': strToU8(detailedXml),
            'apple_health_export/workout-routes/synthetic.gpx': strToU8(gpx),
          }),
        )
      : Buffer.from(baseXml),
  });
  await page.getByRole('button', { name: '2件を保存する' }).click();
  await page.getByRole('button', { name: '記録を見る' }).click();
}
async function settings(page: Page, backup = false) {
  await page.getByRole('button', { name: '目標・バックアップ', exact: true }).click();
  if (backup) await page.getByRole('button', { name: 'バックアップ', exact: true }).click();
}
const backupFile = (content: string) => ({
  name: 'synthetic-backup.json',
  mimeType: 'application/json',
  buffer: Buffer.from(content),
});

test('カレンダーで日別・週別の集計と空日を確認できる', async ({ page }) => {
  await page.goto('./');
  await load(page);
  await page.getByLabel('表示月', { exact: true }).fill('2026-10');
  await expect(page.locator('.calendar-table tbody tr').first()).toContainText('11.0');
  await page.getByRole('button', { name: '2026-10-01 1回 5.0km', exact: true }).click();
  await expect(page.locator('.calendar-selection .run-table tbody tr')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '2026/10/01の記録（1回）' })).toBeVisible();
  await page.getByRole('button', { name: '2026-10-02 0回 0.0km', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2026/10/02の記録（0回）' })).toBeVisible();
  await expect(page.locator('.history-panel .run-table tbody tr')).toHaveCount(2);
  await page.getByLabel('対象月の選択方法').selectOption('range');
  await page.getByLabel('開始月', { exact: true }).fill('2026-09');
  await page.getByLabel('終了月', { exact: true }).fill('2026-10');
  await page.getByRole('button', { name: 'カレンダーの前月' }).click();
  await expect(page.getByLabel('カレンダー表示月')).toHaveValue('2026-09');
});
test('期間比較は独立した月範囲と共通の心拍条件を扱う', async ({ page }) => {
  await page.goto('./#/analysis');
  await load(page);
  await page.locator('summary[aria-label="期間比較"]').click();
  await page.getByLabel('期間Aの開始月').fill('2026-09');
  await page.getByLabel('期間Aの終了月').fill('2026-09');
  await page.getByLabel('期間Bの開始月').fill('2026-10');
  await page.getByLabel('期間Bの終了月').fill('2026-10');
  const distance = page
    .locator('.comparison-table tr')
    .filter({ has: page.getByRole('rowheader', { name: '走行距離', exact: true }) });
  await expect(distance).toContainText('11.0 km');
  await expect(page.getByText('期間Aの距離が0', { exact: false })).toBeVisible();
  await page.getByLabel('平均心拍帯', { exact: true }).selectOption('zone130');
  await expect(distance).toContainText('5.0 km');
  await page.getByLabel('期間Aの終了月').fill('2026-10');
  await expect(page.getByText('比較期間が重複しています。', { exact: true })).toBeVisible();
  await expect(page.getByText('期間の月数が異なります。', { exact: false })).toBeVisible();
  await page.getByLabel('期間Aの開始月').fill('2026-11');
  await expect(page.getByRole('alert')).toContainText('正しい順');
});
test('目標を変更すると達成率とグラフが更新され、再読み込み後も保持する', async ({ page }) => {
  await page.goto('./');
  await load(page);
  await page.getByLabel('表示月', { exact: true }).fill('2026-10');
  await settings(page);
  await page.getByLabel('月間距離目標', { exact: true }).fill('0');
  await page.getByRole('button', { name: '目標を保存する' }).click();
  await expect(page.getByRole('alert')).toContainText('月間距離');
  await page.getByLabel('月間距離目標', { exact: true }).fill('50');
  await page.getByLabel('週間回数目標', { exact: true }).fill('3');
  await page.getByLabel('年間距離目標', { exact: true }).fill('600');
  await page.getByRole('button', { name: '目標を保存する' }).click();
  await expect(page.getByText('目標を保存しました。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '設定を閉じる' }).click();
  await expect(page.getByLabel('50km目標の達成率 22.0%')).toBeVisible();
  await expect(page.locator('.chart-caption')).toContainText('目標 50km');
  await expect(page.getByLabel('年間距離目標の進捗')).toHaveAttribute('value', '11');
  await page.reload();
  await expect(page.getByLabel('50km目標の達成率 22.0%')).toBeVisible();
  await settings(page);
  await expect(page.getByLabel('月間距離目標', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('週間回数目標', { exact: true })).toHaveValue('3');
});
test('実Workerのバックアップを別コンテキストに復元し、コース・目標を保ち重複しない', async ({
  page,
  browser,
  baseURL,
}) => {
  const external: string[] = [];
  const observe = (target: Page) =>
    target.on('request', (request) => {
      if (isExternalRequest(request.url(), baseURL!)) external.push(request.url());
    });
  observe(page);
  await page.goto('./');
  await load(page, true);
  await settings(page);
  await page.getByLabel('月間距離目標', { exact: true }).fill('50');
  await page.getByRole('button', { name: '目標を保存する' }).click();
  await expect(page.getByText('目標を保存しました。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'バックアップ', exact: true }).click();
  const worker = page.waitForEvent('worker'),
    download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'バックアップを書き出す' }).click();
  await worker;
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/^my-running-coach-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const content = readFileSync((await exported.path())!, 'utf8');
  const parsed = JSON.parse(content);
  expect(parsed.runs).toHaveLength(2);
  expect(parsed.routes).toHaveLength(1);
  const context = await browser.newContext();
  try {
    const target = await context.newPage();
    observe(target);
    await target.goto(baseURL!);
    await settings(target, true);
    await target.getByLabel('バックアップJSON').setInputFiles(backupFile(content));
    await expect(target.getByRole('heading', { name: '復元前の確認' })).toBeVisible();
    await target.getByRole('button', { name: 'バックアップ処理をキャンセル' }).click();
    await target.getByRole('button', { name: '設定を閉じる' }).click();
    await expect(target.getByTestId('monthly-distance')).toHaveText('0.0km');
    await settings(target, true);
    await target.getByLabel('バックアップJSON').setInputFiles(backupFile(content));
    await target.getByRole('button', { name: '確認した内容を復元する' }).click();
    await expect(target.getByText('復元しました。追加2件', { exact: false })).toBeVisible();
    await target.getByRole('button', { name: '設定を閉じる' }).click();
    await target.getByLabel('表示月', { exact: true }).fill('2026-10');
    await expect(target.getByLabel('50km目標の達成率 22.0%')).toBeVisible();
    await target.getByRole('link', { name: '走力分析', exact: true }).click();
    await target.getByRole('button', { name: '2026/10/01の詳細' }).click();
    await expect(target.getByRole('img', { name: '選択したランニングのGPSコース' })).toBeVisible();
    await settings(target, true);
    await target.getByLabel('バックアップJSON').setInputFiles(backupFile(content));
    await target.getByLabel('バックアップの目標設定も復元する').uncheck();
    await target.getByRole('button', { name: '確認した内容を復元する' }).click();
    await expect(
      target.getByText('復元しました。追加0件・重複2件', { exact: false }),
    ).toBeVisible();
    await target.getByRole('button', { name: '設定を閉じる' }).click();
    await expect(target.getByTestId('matching-count')).toHaveText('2件のランニング');
    expect(external).toEqual([]);
  } finally {
    await context.close();
  }
});
test('不正JSON・未対応版は既存記録を変更せず、やり直せる', async ({ page }) => {
  await page.goto('./');
  await load(page);
  await settings(page, true);
  await page.getByLabel('バックアップJSON').setInputFiles(backupFile('not json'));
  await expect(page.getByRole('alert')).toContainText('JSON');
  await page
    .getByLabel('バックアップJSON')
    .setInputFiles(backupFile(JSON.stringify({ ...syntheticBackup(), version: 99 })));
  await expect(page.getByRole('alert')).toContainText('バージョン');
  await page
    .getByLabel('バックアップJSON')
    .setInputFiles(backupFile(JSON.stringify(syntheticBackup())));
  await expect(page.getByRole('heading', { name: '復元前の確認' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.history-panel .run-table tbody tr')).toHaveCount(2);
});
test('復元プレビュー中は別タブの取り込みと競合せず、設定のキーボード操作ができる', async ({
  page,
  context,
}) => {
  await page.goto('./');
  const trigger = page.getByRole('button', { name: '目標・バックアップ', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await settings(page, true);
  await page
    .getByLabel('バックアップJSON')
    .setInputFiles(backupFile(JSON.stringify(syntheticBackup())));
  await expect(page.getByRole('heading', { name: '復元前の確認' })).toBeVisible();
  const other = await context.newPage();
  await other.goto('./');
  await other.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await other
    .getByLabel('Apple Healthファイル')
    .setInputFiles({ name: 'export.xml', mimeType: 'text/xml', buffer: Buffer.from(baseXml) });
  await expect(other.getByRole('alert')).toContainText('別のタブ');
  await other.close();
  await page.getByRole('button', { name: 'バックアップ処理をキャンセル' }).click();
  await expect(
    page.getByText('保存済みデータは変更していません。', { exact: false }),
  ).toBeVisible();
});
for (const [name, width, height] of [
  ['phone', 390, 844],
  ['ipad', 768, 1024],
  ['desktop', 1440, 1050],
] as const) {
  test(`Release 0.2の${name}表示が横にはみ出さない`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await load(page);
    await page.getByLabel('表示月', { exact: true }).fill('2026-10');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`calendar-${name}.png`), fullPage: true });
    await page.getByRole('link', { name: '走力分析', exact: true }).click();
    await page.locator('summary[aria-label="期間比較"]').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`comparison-${name}.png`), fullPage: true });
    await settings(page, true);
    expect(
      await page.evaluate(() => {
        const dialog = document.querySelector('dialog')!;
        return dialog.scrollWidth <= dialog.clientWidth + 1;
      }),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`settings-${name}.png`) });
  });
}
