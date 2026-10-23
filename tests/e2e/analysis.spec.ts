import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('../fixtures/synthetic/export.xml', import.meta.url));

test('10km換算・欠損心拍・複合フィルタを表示する', async ({ page }) => {
  await page.goto('./#/analysis');
  await page.getByRole('button', { name: 'データをインポート', exact: true }).click();
  await page.getByLabel('Apple Healthファイル').setInputFiles(fixture);
  await page.getByRole('button', { name: '2件を保存する' }).click();
  await page.getByRole('button', { name: '記録を見る' }).click();
  await expect(page.getByTestId('matching-count')).toHaveText('2件のランニング');
  await expect(page.getByRole('cell', { name: '1:00:00', exact: true })).toHaveCount(2);
  await expect(page.getByRole('cell', { name: 'データなし', exact: true })).toHaveCount(1);
  await page.getByLabel('平均心拍帯', { exact: true }).selectOption('zone130');
  await expect(page.getByTestId('matching-count')).toHaveText('1件のランニング');
  await expect(page.getByRole('cell', { name: '135 bpm', exact: true })).toHaveCount(1);
  await page.getByLabel('距離帯', { exact: true }).selectOption('short');
  await expect(page.getByText('条件に一致するランニングはありません。')).toBeVisible();
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  await page.getByLabel('平均心拍帯', { exact: true }).selectOption('missing');
  await expect(page.getByTestId('matching-count')).toHaveText('1件のランニング');
  await expect(page.getByRole('cell', { name: 'データなし', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  await page.getByLabel('開始日', { exact: true }).fill('2026-10-03');
  await page.getByLabel('終了日', { exact: true }).fill('2026-10-03');
  await expect(page.getByTestId('matching-count')).toHaveText('1件のランニング');
  await page.getByLabel('開始日', { exact: true }).fill('2026-10-04');
  await expect(page.getByRole('alert')).toContainText('開始日は終了日以前');
});

test('心拍が全件欠損でも分析画面が利用できる', async ({ page }) => {
  await page.goto('./#/analysis');
  await page.getByRole('button', { name: 'データをインポート', exact: true }).click();
  const xml =
    '<HealthData><Workout workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="Synthetic" duration="30" durationUnit="min" totalDistance="5" totalDistanceUnit="km" startDate="2026-10-01 10:00:00 +0900" endDate="2026-10-01 10:30:00 +0900"/></HealthData>';
  await page
    .getByLabel('Apple Healthファイル')
    .setInputFiles({ name: 'synthetic.xml', mimeType: 'text/xml', buffer: Buffer.from(xml) });
  await page.getByRole('button', { name: '1件を保存する' }).click();
  await page.getByRole('button', { name: '記録を見る' }).click();
  await expect(page.getByRole('cell', { name: 'データなし', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /^心拍130台での月別ペース推移/ })).toBeVisible();
  await page.getByLabel('平均心拍帯', { exact: true }).selectOption('zone130');
  await expect(page.getByTestId('matching-count')).toHaveText('0件のランニング');
});
