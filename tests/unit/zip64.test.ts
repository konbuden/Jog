import { describe, expect, it } from 'vitest';
import { syntheticZip64 } from '../fixtures/synthetic/zip64';
import { syntheticXml } from '../fixtures/synthetic/xml';
import { importHealthFile } from '../../src/infrastructure/apple-health/import-file';
import { zipMetadata } from '../../src/infrastructure/apple-health/zip-metadata';

const xml = syntheticXml(2);
const input = (bytes: Uint8Array<ArrayBuffer>) => new File([bytes], 'synthetic.zip');
const signature = (zip: Buffer, value: number) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  const offset = zip.indexOf(bytes);
  if (offset < 0) throw new Error('Missing synthetic header');
  return offset;
};

describe('ZIP64', () => {
  it.each(['entries', 'directory'] as const)(
    'ZIP64でも既存の管理情報上限を維持する: %s',
    async (kind) => {
      const zip = syntheticZip64(xml);
      const end = signature(zip, 0x06064b50);
      if (kind === 'entries') {
        zip.writeBigUInt64LE(10_001n, end + 24);
        zip.writeBigUInt64LE(10_001n, end + 32);
      } else zip.writeBigUInt64LE(BigInt(8 * 1024 * 1024 + 1), end + 40);
      await expect(zipMetadata(input(zip))).rejects.toThrow('上限');
    },
  );

  it.each(['encrypted', 'compression'] as const)(
    '未対応ZIP64を理由付きで拒否する: %s',
    async (kind) => {
      const zip = syntheticZip64(xml);
      const central = signature(zip, 0x02014b50);
      if (kind === 'encrypted') zip.writeUInt16LE(0x801, central + 8);
      else zip.writeUInt16LE(99, central + 10);
      await expect(zipMetadata(input(zip))).rejects.toThrow(
        kind === 'encrypted' ? '暗号化' : '圧縮方式',
      );
    },
  );

  it('展開サイズを過小申告したZIPはバッチ保存前に拒否する', async () => {
    let count = 0;
    await expect(
      importHealthFile(
        input(syntheticZip64(xml, { expandedBytes: 12, dataDescriptor: true })),
        async (runs) => {
          count += runs.length;
        },
      ),
    ).rejects.toThrow('整合性');
    expect(count).toBe(0);
  });

  it.each([
    { dataDescriptor: false, endRecords: false },
    { dataDescriptor: true, endRecords: false },
    { dataDescriptor: false, endRecords: true },
    { dataDescriptor: true, endRecords: true },
    { sizeOnly: true, endRecords: false },
  ])('形式の差異を扱い、ランニングを抽出する: %j', async (options) => {
    let count = 0;
    const report = await importHealthFile(input(syntheticZip64(xml, options)), async (runs) => {
      count += runs.length;
    });
    expect(count).toBe(2);
    expect(report.runningCount).toBe(2);
  });

  it.each([4_294_967_296, 4_999_999_999, 5_000_000_000])(
    '宣言サイズ%dを32bitで切り詰めずに読む',
    async (expandedBytes) => {
      const metadata = await zipMetadata(input(syntheticZip64(xml, { expandedBytes })));
      expect(metadata.size).toBe(expandedBytes);
    },
  );

  it('5 GB超過は展開開始前に拒否する', async () => {
    await expect(
      zipMetadata(input(syntheticZip64(xml, { expandedBytes: 5_000_000_001 }))),
    ).rejects.toThrow('5 GB');
  });

  it('宣言と実際の展開サイズが違う場合を拒否する', async () => {
    await expect(
      importHealthFile(
        input(syntheticZip64(xml, { expandedBytes: 4_294_967_296 })),
        async () => {},
      ),
    ).rejects.toThrow('整合性');
  });

  it.each(['extra', 'locator', 'unsafe', 'offset', 'mismatch'] as const)(
    '破損・不正なZIP64管理情報を拒否する: %s',
    async (kind) => {
      const zip = syntheticZip64(xml);
      const central = signature(zip, 0x02014b50);
      const extra = central + 46 + zip.readUInt16LE(central + 28);
      if (kind === 'extra') zip.writeUInt16LE(7, extra + 2);
      if (kind === 'locator')
        zip.writeBigUInt64LE(BigInt(zip.length), signature(zip, 0x07064b50) + 8);
      if (kind === 'unsafe') zip.writeBigUInt64LE(BigInt(Number.MAX_SAFE_INTEGER) + 1n, extra + 4);
      if (kind === 'offset') zip.writeBigUInt64LE(BigInt(zip.length), extra + 20);
      if (kind === 'mismatch') zip[30] = zip[30]! ^ 1;
      await expect(zipMetadata(input(zip))).rejects.toThrow('管理情報');
    },
  );

  it.each(['entry', 'end'] as const)('分割ZIP64を拒否する: %s', async (kind) => {
    const zip = syntheticZip64(xml);
    if (kind === 'entry') zip.writeUInt16LE(1, signature(zip, 0x02014b50) + 34);
    else zip.writeUInt32LE(1, signature(zip, 0x06064b50) + 16);
    await expect(zipMetadata(input(zip))).rejects.toThrow('分割');
  });
});
