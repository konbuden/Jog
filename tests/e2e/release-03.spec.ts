import { test, expect, type Page } from '../helpers/test';
import { syntheticBackup } from '../fixtures/synthetic/backup';
import { syntheticRun } from '../fixtures/synthetic/run';
import type { BackupSnapshot } from '../../src/infrastructure/backup/format';
import { isExternalRequest } from '../helpers/is-external-request';
async function restore(page: Page, backup: BackupSnapshot) {
  await page.getByRole('button', { name: '目標・バックアップ', exact: true }).click();
  await page.getByRole('button', { name: 'バックアップ', exact: true }).click();
  await page.getByLabel('バックアップJSON').setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole('button', { name: '確認した内容を復元する' }).click();
  await expect(page.getByText('復元しました。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '設定を閉じる' }).click();
}
function evaluationData(): BackupSnapshot {
  const target = syntheticRun({
    id: 'e'.repeat(64),
    sourceId: 'target',
    startTime: '2026-10-20T01:00:00.000Z',
    endTime: '2026-10-20T01:30:00.000Z',
  });
  const refs = [1, 2, 3].map((day) =>
    syntheticRun({
      id: String(day).repeat(64),
      sourceId: `ref-${day}`,
      startTime: `2026-09-0${day}T01:00:00.000Z`,
      endTime: `2026-09-0${day}T01:30:50.000Z`,
      durationSeconds: 1850,
      paceSecondsPerKm: 370,
      averageHeartRateBpm: 140,
    }),
  );
  return { ...syntheticBackup(), runs: [target, ...refs], routes: [] };
}
test('月・週は選択期間の達成数、年は選択に関係なく今年の実績を表示する', async ({ page }) => {
  await page.goto('./');
  const backup = evaluationData();
  backup.goals = {
    ...backup.goals,
    monthlyDistanceKm: 10,
    weeklyRunCount: 2,
    annualDistanceKm: 100,
  };
  backup.runs.push(
    syntheticRun({
      id: 'f'.repeat(64),
      sourceId: 'past',
      startTime: '2025-10-01T01:00:00.000Z',
      endTime: '2025-10-01T01:30:00.000Z',
    }),
  );
  await restore(page, backup);
  await page.getByLabel('対象月の選択方法').selectOption('range');
  await page.getByLabel('開始月', { exact: true }).fill('2026-09');
  await page.getByLabel('終了月', { exact: true }).fill('2026-10');
  await expect(page.getByTestId('monthly-achieved')).toHaveText('達成 1 / 2か月');
  await expect(page.getByTestId('weekly-achieved')).toHaveText('達成 1 / 9週');
  await expect(page.getByTestId('annual-progress')).toHaveText('実績 20 km・20.0%');
  await expect(page.getByLabel('年目標の進捗', { exact: true })).toContainText('100 km / 年');
  await page.getByText('月ごとの目標・達成状況を見る', { exact: true }).click();
  await expect(page.getByRole('table', { name: '対象月ごとの目標進捗' })).toContainText('150.0%');
  await page.getByText('週ごとの目標・達成状況を見る', { exact: true }).click();
  await expect(page.getByRole('table', { name: '対象週ごとの目標進捗' })).toContainText('部分週');
  await page.getByLabel('対象月の選択方法').selectOption('single');
  await page.getByLabel('表示月', { exact: true }).fill('2025-10');
  await expect(page.getByTestId('monthly-achieved')).toHaveText('達成 0 / 1か月');
  await expect(page.getByTestId('annual-progress')).toHaveText('実績 20 km・20.0%');
});
test('カレンダーの複数ラン詳細は分析と同じ情報で、閉じると位置・フォーカスが戻る', async ({
  page,
  baseURL,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (isExternalRequest(request.url(), baseURL!)) external.push(request.url());
  });
  await page.goto('./');
  const backup = syntheticBackup();
  backup.runs.push(
    syntheticRun({
      id: 'b'.repeat(64),
      sourceId: 'evening',
      startTime: '2026-10-01T09:00:00.000Z',
      endTime: '2026-10-01T09:30:00.000Z',
      distanceMeters: 6000,
      paceSecondsPerKm: 300,
      averageHeartRateBpm: null,
      heartRateOrigin: null,
    }),
  );
  await restore(page, backup);
  const day = page.getByRole('button', { name: '2026-10-01 2回 11.0km', exact: true });
  await day.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY),
    url = page.url();
  await day.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('当日のランニング', { exact: true }).selectOption('a'.repeat(64));
  await expect(dialog.getByRole('img', { name: '選択したランニングのGPSコース' })).toBeVisible();
  const metrics = await dialog.locator('.detail-metrics').innerText();
  await expect(dialog.getByLabel('当日のランニング', { exact: true })).toBeVisible();
  await dialog.getByLabel('当日のランニング', { exact: true }).selectOption('b'.repeat(64));
  await expect(dialog.locator('.detail-metrics')).toContainText('データなし');
  await expect(dialog.locator('.detail-metrics')).toContainText('50:00');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(day).toBeFocused();
  expect(page.url()).toBe(url);
  expect(Math.abs((await page.evaluate(() => scrollY)) - y)).toBeLessThan(3);
  await day.click();
  await page.getByRole('button', { name: '閉じてカレンダーに戻る' }).click();
  await expect(day).toBeFocused();
  await expect(page.locator('.history-panel th').last()).toContainText('10kmあたりの時間');
  await page.getByRole('link', { name: '走力分析', exact: true }).click();
  await page.getByRole('button', { name: '2026/10/01の詳細' }).last().click();
  await expect(page.getByRole('img', { name: '選択したランニングのGPSコース' })).toBeVisible();
  expect(await page.locator('.run-details .detail-metrics').innerText()).toBe(metrics);
  expect(external).toEqual([]);
});
test('分析ボタンで根拠付きの点数を表示し、対象・フィルタ変更時は結果を消す', async ({
  page,
  baseURL,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (isExternalRequest(request.url(), baseURL!)) external.push(request.url());
  });
  await page.goto('./#/analysis');
  await restore(page, evaluationData());
  await expect(page.getByRole('region', { name: 'ランニングの分析結果' })).toHaveCount(0);
  await page.getByLabel('対象月の選択方法').selectOption('single');
  await page.getByLabel('表示月', { exact: true }).fill('2026-10');
  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(page.getByTestId('evaluation-score')).toHaveText('評価保留（0/3観点）');
  const result = page.getByRole('region', { name: 'ランニングの分析結果' });
  for (const name of ['総括', '良い点', '悪い点・改善を確認する点', 'アドバイス'])
    await expect(result.getByRole('heading', { name, exact: true })).toBeVisible();
  await result.getByText('採点の根拠・比較条件', { exact: true }).click();
  await expect(result.getByRole('table', { name: '同距離帯の推移と今回' })).toContainText(
    '2026/09/01',
  );
  await expect(result).toContainText('過去記録3件');
  await page.getByLabel('平均心拍帯', { exact: true }).selectOption('zone130');
  await expect(result).toHaveCount(0);
  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(page.getByTestId('evaluation-score')).toHaveText('評価保留（0/3観点）');
  await page.getByLabel('対象月の選択方法').selectOption('all');
  await expect(result).toHaveCount(0);
  await page.getByLabel('平均心拍帯', { exact: true }).selectOption('all');
  await page.getByLabel('分析対象のランニング').selectOption('1'.repeat(64));
  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await expect(page.getByTestId('evaluation-score')).toHaveText('評価保留（0/3観点）');
  expect(external).toEqual([]);
});
for (const width of [390, 768, 1440])
  test(`分析・目標・詳細が幅${width}pxで収まる`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    const backup = syntheticBackup();
    backup.runs[0]!.averageHeartRateBpm = null;
    backup.runs[0]!.heartRateOrigin = null;
    await restore(page, backup);
    await page.getByText('週ごとの目標・達成状況を見る', { exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: '2026-10-01 1回 5.0km', exact: true }).click();
    expect(
      await page
        .getByRole('dialog')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath('calendar-popup.png') });
    await page.getByRole('button', { name: '閉じてカレンダーに戻る' }).click();
    await page.getByRole('link', { name: '走力分析', exact: true }).click();
    await page.getByRole('button', { name: '分析する', exact: true }).click();
    await expect(page.getByTestId('evaluation-score')).toHaveText('評価保留（0/3観点）');
    await expect(page.getByRole('region', { name: 'ランニングの分析結果' })).toContainText(
      '平均心拍 データなし',
    );
    await page.getByText('採点の根拠・比較条件', { exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('evaluation.png'), fullPage: true });
    await page.getByLabel('平均心拍帯', { exact: true }).selectOption('zone140');
    await expect(page.getByRole('button', { name: '分析する', exact: true })).toBeDisabled();
    await expect(page.getByRole('region', { name: 'ランニングの分析結果' })).toHaveCount(0);
  });
