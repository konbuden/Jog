import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { fingerprintFile } from '../../src/infrastructure/apple-health/file-fingerprint';
it('ファイル名でなく内容で判定し、方式/サイズ/チャンクSHA-256を含める', async () => {
  const digest = createHash('sha256').update('abc').digest('hex');
  const expected = createHash('sha256')
    .update(JSON.stringify(['mrc-file-sha256-chunks-v1', 1048576, 3, [digest]]))
    .digest('hex');
  const first = await fingerprintFile(new File(['abc'], 'export.xml'));
  expect(first).toBe(expected);
  expect(await fingerprintFile(new File(['abc'], 'renamed.xml'))).toBe(first);
  expect(await fingerprintFile(new File(['abd'], 'export.xml'))).not.toBe(first);
});
it('チャンク境界をまたぐファイルを1 MiBずつ読み、キャンセルを反映する', async () => {
  const file = new File(['x'.repeat(2_100_000)], 'export.xml'),
    slice = vi.spyOn(file, 'slice');
  await fingerprintFile(file);
  expect(slice).toHaveBeenCalledTimes(3);
  expect(slice.mock.calls.every(([start, end]) => Number(end) - Number(start) <= 1048576)).toBe(
    true,
  );
  let cancelled = false;
  await expect(
    fingerprintFile(
      file,
      () => cancelled,
      () => {
        cancelled = true;
      },
    ),
  ).rejects.toThrow('キャンセル');
});
it('空・未対応形式・上限超過を読み込み前に拒否する', async () => {
  await expect(fingerprintFile(new File([], 'export.xml'))).rejects.toThrow('空');
  await expect(fingerprintFile(new File(['x'], 'text.txt'))).rejects.toThrow('ZIPまたはXML');
  const oversized = new File(['x'], 'export.zip');
  Object.defineProperty(oversized, 'size', { value: 200_000_001 });
  await expect(fingerprintFile(oversized)).rejects.toThrow('200 MB');
});
