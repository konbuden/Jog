import { test, expect, type Page } from '../helpers/test';
import { zipSync, strToU8 } from 'fflate';
import { baseXml, detailedXml, gpx } from '../fixtures/synthetic/details';
import { isExternalRequest } from '../helpers/is-external-request';
const payload = (xml = baseXml, name = 'export.xml') => ({
  name,
  mimeType: 'text/xml',
  buffer: Buffer.from(xml),
});
async function select(page: Page, xml = baseXml, name = 'export.xml') {
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await page.getByLabel('Apple Healthファイル').setInputFiles(payload(xml, name));
}
async function save(page: Page, count: number) {
  await page.getByRole('button', { name: `${count}件を保存する`, exact: true }).click();
  await page.getByRole('button', { name: '記録を見る', exact: true }).click();
}
async function deletion(page: Page) {
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await page.getByRole('button', { name: '取り込み済みデータを全削除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '取り込み済みデータを全削除' })).toBeVisible();
}

test('同一ファイルは改名しても再解析せず、同じXMLとZIPを2回保存しない', async ({ page }) => {
  await page.goto('./#/analysis');
  await select(page);
  await expect(page.getByRole('button', { name: '2件を保存する' })).toBeEnabled();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await select(page);
  await save(page, 2);
  await select(page, baseXml, 'renamed.xml');
  await expect(page.getByText('このファイルは取り込み済みです。', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '0件を保存する' })).toBeDisabled();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.getByTestId('matching-count')).toHaveText('2件のランニング');
  const zip = Buffer.from(zipSync({ 'apple_health_export/export.xml': strToU8(baseXml) }));
  await page.getByRole('button', { name: 'データをインポート', exact: true }).click();
  await page
    .getByLabel('Apple Healthファイル')
    .setInputFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: zip });
  await expect(page.getByRole('button', { name: '0件を保存する' })).toBeDisabled();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await page.getByRole('button', { name: 'データをインポート', exact: true }).click();
  await page
    .getByLabel('Apple Healthファイル')
    .setInputFiles({ name: 'renamed.zip', mimeType: 'application/zip', buffer: zip });
  await expect(page.getByText('このファイルは取り込み済みです。', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '0件を保存する' })).toBeDisabled();
});
test('ファイル内の重複と機器表記差を除外し、既存＋新規の差分だけを追加する', async ({ page }) => {
  await page.goto('./#/analysis');
  const workouts = baseXml.match(/<Workout\s[\s\S]*?<\/Workout>/g)!;
  const duplicate = baseXml.replace('</HealthData>', `${workouts[0]}${workouts[1]}</HealthData>`);
  await select(page, duplicate);
  await expect(page.locator('.preview-counts')).toContainText('2重複');
  await save(page, 2);
  const changed = baseXml.replaceAll(
    'sourceName="Synthetic Watch"',
    'device="Synthetic changed 0x222" sourceName="Synthetic Watch"',
  );
  const extra = workouts[0]!.replaceAll('2026-10-01', '2026-10-05');
  const mixed = changed.replace('</HealthData>', `${extra}</HealthData>`);
  await select(page, mixed);
  await expect(page.getByRole('button', { name: '1件を保存する' })).toBeEnabled();
  await expect(
    page.getByText('新規対象期間：2026/10/05 〜 2026/10/05', { exact: true }),
  ).toBeVisible();
  await save(page, 1);
  await expect(page.getByTestId('matching-count')).toHaveText('3件のランニング');
  await page.reload();
  await expect(page.getByTestId('matching-count')).toHaveText('3件のランニング');
});
test('通常の取り込みでは既存詳細やコースを処理せず、必要時だけ明示して補う', async ({ page }) => {
  await page.goto('./#/analysis');
  await select(page);
  await save(page, 2);
  const bad = zipSync({
    'apple_health_export/export.xml': strToU8(detailedXml),
    'apple_health_export/workout-routes/synthetic.gpx': strToU8('broken gpx'),
  });
  await page.getByRole('button', { name: 'データをインポート', exact: true }).click();
  await page
    .getByLabel('Apple Healthファイル')
    .setInputFiles({ name: 'details.zip', mimeType: 'application/zip', buffer: Buffer.from(bad) });
  await expect(page.getByRole('button', { name: '0件を保存する' })).toBeDisabled();
  await expect(page.getByText('一部のコースを読み込めませんでした', { exact: false })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await page.getByRole('button', { name: '2026/10/01の詳細' }).click();
  await expect(page.locator('.detail-metrics')).not.toContainText('180 歩/分');
  await page.getByRole('button', { name: 'ランニング詳細を閉じる' }).click();
  const good = zipSync({
    'apple_health_export/export.xml': strToU8(detailedXml),
    'apple_health_export/workout-routes/synthetic.gpx': strToU8(gpx),
  });
  await page.getByRole('button', { name: 'データをインポート', exact: true }).click();
  await page.getByLabel('既存記録の不足詳細も追加する').check();
  await page
    .getByLabel('Apple Healthファイル')
    .setInputFiles({ name: 'details.zip', mimeType: 'application/zip', buffer: Buffer.from(good) });
  await page.getByRole('button', { name: '0件を保存・1件の詳細を追加' }).click();
  await page.getByRole('button', { name: '記録を見る' }).click();
  await expect(page.getByTestId('matching-count')).toHaveText('2件のランニング');
  await page.getByRole('button', { name: '2026/10/01の詳細' }).click();
  await expect(page.getByRole('img', { name: '選択したランニングのGPSコース' })).toBeVisible();
});
test('全削除は確認が必要で、キャンセルは変更せず、削除後は同じZIPから再取り込みできる', async ({
  page,
  baseURL,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (isExternalRequest(request.url(), baseURL!)) external.push(request.url());
  });
  const archive = Buffer.from(
    zipSync({
      'apple_health_export/export.xml': strToU8(detailedXml),
      'apple_health_export/workout-routes/synthetic.gpx': strToU8(gpx),
    }),
  );
  const selectZip = async () => {
    await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
    await page
      .getByLabel('Apple Healthファイル')
      .setInputFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: archive });
  };
  await page.goto('./');
  await selectZip();
  await save(page, 2);
  await page.getByRole('button', { name: '目標・バックアップ', exact: true }).click();
  await page.getByLabel('月間距離目標', { exact: true }).fill('50');
  await page.getByRole('button', { name: '目標を保存する' }).click();
  await expect(page.getByText('目標を保存しました。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '設定を閉じる' }).click();
  await deletion(page);
  await expect(
    page.getByRole('button', { name: '全データを削除する', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '削除をキャンセル' }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.locator('.history-panel .run-table tbody tr')).toHaveCount(2);
  await deletion(page);
  await page.getByLabel('削除対象を確認しました').check();
  await page.getByRole('button', { name: '全データを削除する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'データを削除しました' })).toBeVisible();
  await page.getByRole('button', { name: '記録を見る' }).click();
  await expect(page.getByText('最初のランニングを、ここから。')).toBeVisible();
  await page.getByRole('button', { name: '目標・バックアップ', exact: true }).click();
  await expect(page.getByLabel('月間距離目標', { exact: true })).toHaveValue('50');
  await page.getByRole('button', { name: '設定を閉じる' }).click();
  await selectZip();
  await expect(page.getByRole('button', { name: '2件を保存する' })).toBeEnabled();
  await save(page, 2);
  await page.getByLabel('表示月', { exact: true }).fill('2026-10');
  await expect(page.getByLabel('50km目標の達成率 22.0%')).toBeVisible();
  expect(external).toEqual([]);
});
test('別タブの取り込み中は全削除せず、確認後に件数が変われば再確認する', async ({
  page,
  context,
}) => {
  await page.goto('./#/analysis');
  await select(page);
  await save(page, 2);
  await deletion(page);
  await page.getByLabel('削除対象を確認しました').check();
  const other = await context.newPage();
  await other.goto('./#/analysis');
  const extra = baseXml
    .match(/<Workout\s[\s\S]*?<\/Workout>/g)![0]!
    .replaceAll('2026-10-01', '2026-10-06');
  await select(other, `<HealthData>${extra}</HealthData>`);
  await expect(other.getByRole('button', { name: '1件を保存する' })).toBeEnabled();
  await page.getByRole('button', { name: '全データを削除する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('別のタブ');
  await expect(page.getByLabel('削除対象を確認しました')).not.toBeChecked();
  await save(other, 1);
  await page.getByLabel('削除対象を確認しました').check();
  await page.getByRole('button', { name: '全データを削除する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('件数が変わりました');
  await expect(page.getByLabel('削除対象を確認しました')).not.toBeChecked();
  await page.getByRole('button', { name: '削除をキャンセル' }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByTestId('matching-count')).toHaveText('3件のランニング');
  await other.close();
});
test('削除確認と差分選択がスマートフォンで操作できる', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await select(page);
  await save(page, 2);
  await deletion(page);
  await page.getByLabel('削除対象を確認しました').check();
  expect(
    await page.evaluate(() => {
      const dialog = document.querySelector('dialog')!;
      return dialog.scrollWidth <= dialog.clientWidth + 1;
    }),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('delete-confirm-phone.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.history-panel .run-table tbody tr')).toHaveCount(2);
});
