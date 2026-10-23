import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('../fixtures/synthetic/export.xml', import.meta.url));

test('空状態で架空の記録を表示しない', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('最初のランニングを、ここから。')).toBeVisible();
  await expect(page.getByTestId('monthly-distance')).toHaveText('0.0km');
  await expect(page.getByTestId('average-heart-rate')).toHaveText('—bpm');
});

test('月間距離・ペース・心拍・履歴と月変更を表示する', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await page.getByLabel('Apple Healthファイル').setInputFiles(fixture);
  await page.getByRole('button', { name: '2件を保存する' }).click();
  await page.getByRole('button', { name: '記録を見る' }).click();
  await page.getByLabel('表示月', { exact: true }).fill('2026-10');
  await expect(page.getByTestId('monthly-distance')).toHaveText('11.0km');
  await expect(page.getByTestId('average-pace')).toHaveText('6′00″/km');
  await expect(page.getByTestId('average-heart-rate')).toHaveText('135bpm');
  await expect(page.getByLabel('100km目標の達成率 11.0%')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'データなし', exact: true })).toBeVisible();
  await expect(page.locator('.run-table tbody tr')).toHaveCount(2);
  await page.getByLabel('表示月', { exact: true }).fill('2026-09');
  await expect(page.getByTestId('monthly-distance')).toHaveText('0.0km');
  await page.reload();
  await expect(page.locator('.run-table tbody tr')).toHaveCount(2);
});
