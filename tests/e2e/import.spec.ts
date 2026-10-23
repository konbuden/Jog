import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../fixtures/synthetic/export.xml', import.meta.url));

test('実Workerで解析し、確認後だけ保存し、再取り込みで重複しない', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await page.getByLabel('Apple Healthファイル').setInputFiles(fixture);
  await expect(page.getByRole('heading', { name: '保存前の確認' })).toBeVisible();
  await expect(page.getByText('2026/10/01 〜 2026/10/03', { exact: false })).toBeVisible();
  const before = await page.evaluate(async () => {
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open('my-running-coach-v1');
      request.onsuccess = () => {
        const connection = request.result;
        const count = connection.transaction('runs').objectStore('runs').count();
        count.onsuccess = () => {
          resolve(count.result);
          connection.close();
        };
        count.onerror = () => reject(count.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  expect(before).toBe(0);
  await page.getByRole('button', { name: '2件を保存する' }).click();
  await expect(page.getByText('2件を保存しました。重複0件。')).toBeVisible();
  await page.getByRole('button', { name: '記録を見る' }).click();
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await page.getByLabel('Apple Healthファイル').setInputFiles(fixture);
  await expect(page.getByRole('button', { name: '0件を保存する' })).toBeDisabled();
  await expect(page.getByText('ランニング 2件を検出。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('不正ファイルのエラーを表示し、やり直せる', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await page.getByLabel('Apple Healthファイル').setInputFiles({
    name: 'invalid.xml',
    mimeType: 'text/xml',
    buffer: Buffer.from('<HealthData><Workout></HealthData>'),
  });
  await expect(page.getByRole('alert')).toContainText('XMLの形式が不正');
  await page.getByLabel('Apple Healthファイル').setInputFiles(fixture);
  await expect(page.getByRole('button', { name: '2件を保存する' })).toBeEnabled();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
