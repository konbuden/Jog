import { test, expect, type Page } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { baseXml, detailedXml, gpx } from '../fixtures/synthetic/details';
import { isExternalRequest } from '../helpers/is-external-request';
const archive = () =>
  Buffer.from(
    zipSync({
      'apple_health_export/export.xml': strToU8(detailedXml),
      'apple_health_export/workout-routes/synthetic.gpx': strToU8(gpx),
    }),
  );
async function startImport(page: Page, zip = false) {
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await page.getByLabel('Apple Healthファイル').setInputFiles({
    name: zip ? 'synthetic.zip' : 'export.xml',
    mimeType: zip ? 'application/zip' : 'text/xml',
    buffer: zip ? archive() : Buffer.from(baseXml),
  });
}
async function finishImport(page: Page) {
  await page.getByRole('button', { name: '2件を保存する' }).click();
  await page.getByRole('button', { name: '記録を見る' }).click();
}
test('両画面で単月・複数月を選び、集計と履歴を同じ対象月に絞る', async ({ page }) => {
  await page.goto('./');
  await startImport(page);
  await finishImport(page);
  await page.getByLabel('表示月', { exact: true }).fill('2026-09');
  await expect(page.getByTestId('monthly-distance')).toHaveText('0.0km');
  await expect(page.locator('.run-table tbody tr')).toHaveCount(0);
  await page.getByLabel('対象月の選択方法').selectOption('range');
  await page.getByLabel('開始月', { exact: true }).fill('2026-09');
  await page.getByLabel('終了月', { exact: true }).fill('2026-10');
  await expect(page.getByTestId('monthly-distance')).toHaveText('11.0km');
  await expect(page.getByLabel('200km目標の達成率 5.5%')).toBeVisible();
  await expect(page.locator('.run-table tbody tr')).toHaveCount(2);
  await page.getByRole('link', { name: '走力分析', exact: true }).click();
  await page.getByLabel('対象月の選択方法').selectOption('single');
  await page.getByLabel('表示月', { exact: true }).fill('2026-09');
  await expect(page.getByTestId('matching-count')).toHaveText('0件のランニング');
  await page.getByLabel('対象月の選択方法').selectOption('range');
  await page.getByLabel('開始月', { exact: true }).fill('2026-09');
  await page.getByLabel('終了月', { exact: true }).fill('2026-10');
  await expect(page.getByTestId('matching-count')).toHaveText('2件のランニング');
  await page.getByLabel('平均心拍帯', { exact: true }).selectOption('zone130');
  await expect(page.getByTestId('matching-count')).toHaveText('1件のランニング');
  await page.getByLabel('開始月', { exact: true }).fill('2026-11');
  await expect(page.getByRole('alert')).toContainText('開始月は終了月以前');
});
test('選んだランのコースと追加指標を表示し、位置情報を外部送信しない', async ({
  page,
  baseURL,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (isExternalRequest(request.url(), baseURL!)) external.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/analysis');
  await startImport(page, true);
  await finishImport(page);
  await page.getByRole('button', { name: '2026/10/01の詳細' }).click();
  await expect(page.getByRole('img', { name: '選択したランニングのGPSコース' })).toBeVisible();
  await expect(page.locator('.detail-metrics')).toContainText('180 歩/分');
  await expect(page.locator('.detail-metrics')).toContainText('250 W');
  await expect(page.locator('.detail-metrics')).toContainText('300 kcal');
  await expect(page.getByText('平均ケイデンスは、Workout内の歩数', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('run-details-phone.png'), fullPage: true });
  await page.getByRole('button', { name: '2026/10/03の詳細' }).click();
  await expect(
    page.getByText('この記録にはコース情報がありません。', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: '選択したランニングのGPSコース' })).toHaveCount(0);
  expect(external).toEqual([]);
});
test('既存記録へ再インポートで詳細を追加し、キャンセルと再取り込みでも重複しない', async ({
  page,
}) => {
  await page.goto('./#/analysis');
  await startImport(page);
  await finishImport(page);
  await startImport(page, true);
  await expect(
    page.getByText('既存の1件にコース・追加指標を補います。', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await page.getByRole('button', { name: '2026/10/01の詳細' }).click();
  await expect(page.getByRole('img', { name: '選択したランニングのGPSコース' })).toHaveCount(0);
  await page.getByRole('button', { name: 'ランニング詳細を閉じる' }).click();
  await startImport(page, true);
  await page.getByRole('button', { name: '0件を保存・1件の詳細を追加' }).click();
  await page.getByRole('button', { name: '記録を見る' }).click();
  await expect(page.getByTestId('matching-count')).toHaveText('2件のランニング');
  await page.getByRole('button', { name: '2026/10/01の詳細' }).click();
  await expect(page.getByRole('img', { name: '選択したランニングのGPSコース' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '2026/10/01の詳細' }).click();
  await expect(page.getByRole('img', { name: '選択したランニングのGPSコース' })).toBeVisible();
  await startImport(page, true);
  await expect(page.getByRole('button', { name: '0件を保存する' })).toBeDisabled();
});
