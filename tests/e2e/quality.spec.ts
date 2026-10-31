import { test, expect, type Page } from '../helpers/test';
import { syntheticXml } from '../fixtures/synthetic/xml';
import { isExternalRequest } from '../helpers/is-external-request';

async function loadSynthetic(page: Page) {
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await page.getByLabel('Apple Healthファイル').setInputFiles({
    name: 'synthetic.xml',
    mimeType: 'text/xml',
    buffer: Buffer.from(syntheticXml(24)),
  });
  await page.getByRole('button', { name: '24件を保存する' }).click();
  await page.getByRole('button', { name: '記録を見る' }).click();
}

test('直近10件と分析ページの20件ずつの表示', async ({ page }) => {
  await page.goto('./');
  await loadSynthetic(page);
  await page.getByLabel('対象月の選択方法').selectOption('all');
  await expect(page.locator('.run-table tbody tr')).toHaveCount(10);
  await expect(page.locator('.run-table tbody tr').first()).toContainText('2026/10/13');
  await page.getByRole('link', { name: '走力分析', exact: true }).click();
  await expect(page.locator('.run-table tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: '次のページ' }).click();
  await expect(page.locator('.run-table tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: '前のページ' }).click();
  await expect(page.locator('.run-table tbody tr')).toHaveCount(20);
});

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['ipad', 768, 1024],
  ['desktop', 1440, 1050],
] as const) {
  test(`${name}でページ全体が横にはみ出さない`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await loadSynthetic(page);
    await page.getByLabel('表示月', { exact: true }).fill('2026-10');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${name}.png`), fullPage: true });
    await page.getByRole('link', { name: '走力分析', exact: true }).click();
    await expect(page.getByRole('heading', { name: '走力分析', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`analysis-${name}.png`), fullPage: true });
  });
}

test('キーボードでダイアログを開閉し、分析画面のスキップリンクを使える', async ({ page }) => {
  await page.goto('./#/analysis');
  await expect(page.getByRole('heading', { name: '記録を絞り込む' })).toBeVisible();
  const trigger = page.getByRole('button', { name: 'データをインポート', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByRole('link', { name: 'メインコンテンツへ' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.getByRole('heading', { name: '走力分析', exact: true })).toBeVisible();
});

test('別タブの取り込みと競合しても一時データを消さない', async ({ page, context }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  const payload = {
    name: 'synthetic.xml',
    mimeType: 'text/xml',
    buffer: Buffer.from(syntheticXml(1)),
  };
  await page.getByLabel('Apple Healthファイル').setInputFiles(payload);
  await expect(page.getByRole('button', { name: '1件を保存する' })).toBeEnabled();
  const other = await context.newPage();
  await other.goto('./');
  await other.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await other.getByLabel('Apple Healthファイル').setInputFiles(payload);
  await expect(other.getByRole('alert')).toContainText('別のタブ');
  await page.getByRole('button', { name: '1件を保存する' }).click();
  await expect(page.getByText('1件を保存しました。重複0件。')).toBeVisible();
  await other.close();
});

test('途中で壊れたXMLを部分保存せず、外部通信もしない', async ({ page, baseURL }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (isExternalRequest(request.url(), baseURL!)) external.push(request.url());
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  const broken = syntheticXml(400).replace('</HealthData>', '<broken>');
  await page
    .getByLabel('Apple Healthファイル')
    .setInputFiles({ name: 'synthetic.xml', mimeType: 'text/xml', buffer: Buffer.from(broken) });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByText('最初のランニングを、ここから。')).toBeVisible();
  expect(external).toEqual([]);
});

test('大きなXMLの解析中もメインスレッドが応答する', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  const workerCreated = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  const record =
    '<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Synthetic Watch" value="135" unit="count/min" startDate="2026-10-01 10:00:00 +0900" endDate="2026-10-01 10:00:00 +0900"/>';
  const content = `<HealthData>${record.repeat(Math.ceil((25 * 1024 * 1024) / record.length))}</HealthData>`;
  await page.evaluate(() => {
    (window as unknown as { ticks: number }).ticks = 0;
    setInterval(() => {
      (window as unknown as { ticks: number }).ticks++;
    }, 16);
  });
  await page.getByLabel('Apple Healthファイル').setInputFiles({
    name: 'synthetic-large.xml',
    mimeType: 'text/xml',
    buffer: Buffer.from(content),
  });
  expect((await workerCreated).url()).toContain('import.worker');
  await expect(page.getByRole('heading', { name: '保存前の確認' })).toBeVisible({
    timeout: 45_000,
  });
  expect(await page.evaluate(() => (window as unknown as { ticks: number }).ticks)).toBeGreaterThan(
    5,
  );
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
