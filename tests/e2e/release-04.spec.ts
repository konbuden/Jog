import { test, expect, type Page } from '../helpers/test';
import { readFileSync } from 'node:fs';
import { syntheticBackup } from '../fixtures/synthetic/backup';
import { reviewedRun, syntheticReview } from '../fixtures/synthetic/review';
import { lapsText } from '../../src/domain/analytics/review';
import type { BackupSnapshot } from '../../src/infrastructure/backup/format';
import { isExternalRequest } from '../helpers/is-external-request';
const snapshot = (reviews = true): BackupSnapshot => ({
  ...syntheticBackup(),
  version: reviews ? 2 : 1,
  runs: [
    reviewedRun(),
    {
      ...reviewedRun(),
      id: 'd'.repeat(64),
      sourceId: 'synthetic-prior',
      startTime: '2026-09-15T01:00:00.000Z',
      endTime: '2026-09-15T02:05:00.000Z',
      durationSeconds: 3900,
      paceSecondsPerKm: 390,
      averageHeartRateBpm: 120,
    },
  ],
  routes: [],
  ...(reviews ? { reviews: [syntheticReview()] } : {}),
});
async function restore(page: Page, data = snapshot()) {
  await page.getByRole('button', { name: '目標・バックアップ', exact: true }).click();
  await page.getByRole('button', { name: 'バックアップ', exact: true }).click();
  await page.getByLabel('バックアップJSON').setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole('button', { name: '確認した内容を復元する' }).click();
  await expect(page.getByText('復元しました。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '設定を閉じる' }).click();
}
const openReview = async (page: Page) =>
  page.getByText('振り返り・区間ラップを入力する（任意）', { exact: true }).click();
test('カレンダー最下部で3観点を分析し、対象月外の過去記録も使って分析ページと一致する', async ({
  page,
  baseURL,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (isExternalRequest(request.url(), baseURL!)) external.push(request.url());
  });
  await page.goto('./');
  await restore(page);
  await page.getByRole('button', { name: '2026-10-12 1回 10.0km', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: '該当日のランニング分析・アドバイス', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(dialog.getByTestId('evaluation-score')).toHaveText('90 / 100点');
  const report = dialog.getByRole('region', { name: 'ランニングの分析結果' });
  for (const name of ['10km走行能力', 'ペース管理能力', '運動中の余力', '翌日回復の確認'])
    await expect(report.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(report).toContainText('強度が上がった可能性');
  const text = await report.innerText();
  await page.getByRole('button', { name: '閉じてカレンダーに戻る' }).click();
  await page.getByRole('link', { name: '走力分析', exact: true }).click();
  await page.getByLabel('対象月の選択方法').selectOption('single');
  await page.getByLabel('表示月', { exact: true }).fill('2026-10');
  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(page.getByTestId('evaluation-score')).toHaveText('90 / 100点');
  expect(await page.getByRole('region', { name: 'ランニングの分析結果' }).innerText()).toBe(text);
  expect(external).toEqual([]);
});
test('振り返りの保存・再読み込みと、区間不正・申告不一致・入力変更での結果消去', async ({
  page,
}) => {
  await page.goto('./#/analysis');
  await restore(page, snapshot(false));
  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(page.getByTestId('evaluation-score')).toHaveText('評価保留（1/3観点）');
  await openReview(page);
  await page.getByLabel('区間ラップ（本人入力）').fill('1, 6:00');
  await page.getByRole('button', { name: '振り返りを保存する' }).click();
  await expect(page.getByRole('alert')).toContainText('区間距離');
  await page.getByLabel('区間ラップ（本人入力）').fill(lapsText(syntheticReview().laps));
  await page.getByLabel('終了時のきつさ（RPE 1〜10）').fill('4');
  await page.getByLabel('追加2〜3kmを走る余裕').selectOption('yes');
  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(page.getByTestId('evaluation-score')).toHaveText('90 / 100点');
  await page.getByLabel('終了時のきつさ（RPE 1〜10）').fill('8');
  await expect(page.getByRole('region', { name: 'ランニングの分析結果' })).toHaveCount(0);
  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(page.getByTestId('evaluation-score')).toHaveText('評価保留（2/3観点）');
  await expect(page.getByRole('region', { name: 'ランニングの分析結果' })).toContainText(
    '申告に不一致',
  );
  await page.getByLabel('終了時のきつさ（RPE 1〜10）').fill('3');
  await page.getByRole('button', { name: '振り返りを保存する' }).click();
  await expect(page.getByText('振り返りを保存しました', { exact: false })).toContainText(
    '振り返りを保存しました',
  );
  await page.reload();
  await openReview(page);
  await expect(page.getByLabel('終了時のきつさ（RPE 1〜10）')).toHaveValue('3');
  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(page.getByTestId('evaluation-score')).toHaveText('93 / 100点');
  await page.getByLabel('分析対象のランニング').selectOption('d'.repeat(64));
  await expect(page.getByRole('region', { name: 'ランニングの分析結果' })).toHaveCount(0);
  await expect(page.getByLabel('終了時のきつさ（RPE 1〜10）')).not.toBeVisible();
  await openReview(page);
  await expect(page.getByLabel('終了時のきつさ（RPE 1〜10）')).toHaveValue('');
});
test('別タブで更新された振り返りを古い編集で上書きしない', async ({ page, context }) => {
  await page.goto('./#/analysis');
  await restore(page);
  await openReview(page);
  await page.getByLabel('終了時のきつさ（RPE 1〜10）').fill('2');
  const other = await context.newPage();
  await other.goto('./#/analysis');
  await openReview(other);
  await other.getByLabel('終了時のきつさ（RPE 1〜10）').fill('5');
  await other.getByRole('button', { name: '振り返りを保存する' }).click();
  await expect(other.getByText('振り返りを保存しました', { exact: false })).toContainText(
    '振り返りを保存しました',
  );
  await expect(page.getByRole('alert')).toContainText('別の画面で');
  await expect(page.getByLabel('終了時のきつさ（RPE 1〜10）')).toHaveValue('2');
  await expect(page.getByRole('button', { name: '振り返りを保存する' })).toBeDisabled();
  await page.getByRole('button', { name: '保存済み内容を読み直す' }).click();
  await expect(page.getByLabel('終了時のきつさ（RPE 1〜10）')).toHaveValue('5');
  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(page.getByTestId('evaluation-score')).toHaveText('87 / 100点');
  await other.close();
});
test('バックアップに振り返りを含め、確認付き全削除でも消去する', async ({ page }) => {
  await page.goto('./');
  await restore(page);
  await page.getByRole('button', { name: '目標・バックアップ', exact: true }).click();
  await page.getByRole('button', { name: 'バックアップ', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'バックアップを書き出す' }).click();
  const content = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(content.version).toBe(2);
  expect(content.reviews).toEqual([syntheticReview()]);
  await page.getByRole('button', { name: '設定を閉じる' }).click();
  await page.getByRole('button', { name: 'データをインポート', exact: true }).first().click();
  await page.getByRole('button', { name: '取り込み済みデータを全削除', exact: true }).click();
  await expect(
    page
      .locator('.delete-imported dl div')
      .filter({ has: page.getByText('振り返り', { exact: true }) }),
  ).toContainText('1件');
  await page.getByLabel('削除対象を確認しました').check();
  await page.getByRole('button', { name: '全データを削除する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'データを削除しました' })).toBeVisible();
  await page.getByRole('button', { name: '記録を見る' }).click();
  await restore(page, snapshot(false));
  await page.getByRole('link', { name: '走力分析', exact: true }).click();
  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(page.getByTestId('evaluation-score')).toHaveText('評価保留（1/3観点）');
});
for (const width of [390, 768, 1440])
  test(`分析付きポップアップが幅${width}pxで操作でき、元の日付へ戻る`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await restore(page);
    const day = page.getByRole('button', { name: '2026-10-12 1回 10.0km', exact: true });
    await day.click();
    const dialog = page.getByRole('dialog');
    await openReview(page);
    await page.getByRole('button', { name: '分析する', exact: true }).click();
    await expect(dialog.getByTestId('evaluation-score')).toHaveText('90 / 100点');
    await dialog.getByText('採点の根拠・比較条件', { exact: true }).click();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dialog.getByTestId('evaluation-score').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('popup-analysis.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(day).toBeFocused();
  });
