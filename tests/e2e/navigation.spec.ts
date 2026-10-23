import { test, expect } from '@playwright/test';

test('2画面を移動できる', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'ダッシュボード', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '走力分析', exact: true }).click();
  await expect(page.getByRole('heading', { name: '走力分析', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '走力分析', exact: true })).toBeVisible();
});
