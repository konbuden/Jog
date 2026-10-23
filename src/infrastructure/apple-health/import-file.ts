import { ImportError } from './errors';
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import { HealthParser, identifyRun, type ParseReport } from './parser';
import type { RunCandidate } from '../../domain/models/run';

export const IMPORT_LIMITS = {
  xmlBytes: 512 * 1024 * 1024,
  zipBytes: 128 * 1024 * 1024,
  zipEntries: 10_000,
  centralDirectoryBytes: 8 * 1024 * 1024,
};
const isExport = (name: string) =>
  /(^|\/)export\.xml$/i.test(name) && !name.split('/').includes('..');
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function updateCrc(crc: number, chunk: Uint8Array) {
  for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return crc;
}

/** Read the bounded ZIP central directory before extracting; reject ambiguous/encrypted/ZIP64 input. */
async function zipMetadata(file: Blob) {
  const tail = new Uint8Array(await file.slice(-65_557).arrayBuffer());
  const view = new DataView(tail.buffer);
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index--) {
    if (
      view.getUint32(index, true) === 0x06054b50 &&
      index + 22 + view.getUint16(index + 20, true) === tail.length
    ) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new ImportError('ZIPが破損しているか、完全ではありません。');
  const entries = view.getUint16(eocd + 10, true),
    size = view.getUint32(eocd + 12, true),
    offset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || size === 0xffffffff || offset === 0xffffffff)
    throw new ImportError('ZIP64には対応していません。export.xmlを直接選択してください。');
  if (
    view.getUint16(eocd + 4, true) ||
    view.getUint16(eocd + 6, true) ||
    view.getUint16(eocd + 8, true) !== entries
  )
    throw new ImportError('分割ZIPには対応していません。');
  if (entries > IMPORT_LIMITS.zipEntries || size > IMPORT_LIMITS.centralDirectoryBytes)
    throw new ImportError(
      'ZIPの項目数・管理情報が上限を超えています。export.xmlを直接選択してください。',
    );
  if (offset + size > file.size - 22) throw new ImportError('ZIPの管理情報が不正です。');
  const directory = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
  const central = new DataView(directory.buffer);
  let position = 0;
  let target: { name: string; crc: number; size: number } | undefined;
  for (let index = 0; index < entries; index++) {
    if (position + 46 > directory.length || central.getUint32(position, true) !== 0x02014b50)
      throw new ImportError('ZIPの項目情報が不正です。');
    const nameLength = central.getUint16(position + 28, true),
      extraLength = central.getUint16(position + 30, true),
      commentLength = central.getUint16(position + 32, true);
    if (position + 46 + nameLength + extraLength + commentLength > directory.length)
      throw new ImportError('ZIPの項目が途中で切れています。');
    const name = new TextDecoder().decode(
      directory.subarray(position + 46, position + 46 + nameLength),
    );
    if (isExport(name)) {
      if (target)
        throw new ImportError('export.xmlが複数あります。対象XMLを直接選択してください。');
      if (central.getUint16(position + 8, true) & 1)
        throw new ImportError('暗号化ZIPには対応していません。');
      const compression = central.getUint16(position + 10, true);
      if (compression !== 0 && compression !== 8)
        throw new ImportError('このZIP圧縮方式には対応していません。');
      target = {
        name,
        crc: central.getUint32(position + 16, true),
        size: central.getUint32(position + 24, true),
      };
      if (target.size > IMPORT_LIMITS.xmlBytes)
        throw new ImportError('展開後のXMLが512 MiBを超えています。');
    }
    position += 46 + nameLength + extraLength + commentLength;
  }
  if (!target) throw new ImportError('ZIP内にexport.xmlが見つかりません。');
  return target;
}

// Starting every entry avoids fflate retaining compressed chunks for unstarted files.
// Unrelated GPX/clinical data is discarded without decompression or storage.
class SelectiveInflate extends UnzipInflate {
  private selected: boolean;
  constructor(name: string) {
    super();
    this.selected = isExport(name);
  }
  override push(chunk: Uint8Array<ArrayBuffer>, final: boolean) {
    if (this.selected) super.push(chunk, final);
    else this.ondata(null, new Uint8Array(), final);
  }
}
class SelectivePassThrough extends UnzipPassThrough {
  private selected: boolean;
  constructor(name: string) {
    super();
    this.selected = isExport(name);
  }
  override push(chunk: Uint8Array<ArrayBuffer>, final: boolean) {
    this.ondata(null, this.selected ? chunk : new Uint8Array(), final);
  }
}

export async function importHealthFile(
  file: Blob & { name: string },
  onBatch: (runs: RunCandidate[]) => Promise<void>,
  onProgress: (percent: number) => void = () => {},
  isCancelled: () => boolean = () => false,
): Promise<ParseReport> {
  const zip = /\.zip$/i.test(file.name),
    xml = /\.xml$/i.test(file.name);
  if (!zip && !xml) throw new ImportError('ZIPまたはXMLファイルを選択してください。');
  if (file.size === 0) throw new ImportError('ファイルが空です。');
  if (file.size > (zip ? IMPORT_LIMITS.zipBytes : IMPORT_LIMITS.xmlBytes))
    throw new ImportError(
      zip
        ? 'ZIPは128 MiBまで対応しています。export.xmlを直接選択してください。'
        : 'XMLは512 MiBまで対応しています。',
    );
  const pending: Parameters<typeof identifyRun>[0][] = [];
  const parser = new HealthParser((run) => pending.push(run));
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let expanded = 0,
    crc = 0xffffffff;
  const consume = (chunk: Uint8Array) => {
    expanded += chunk.length;
    if (expanded > IMPORT_LIMITS.xmlBytes)
      throw new ImportError('展開後のXMLが512 MiBを超えています。');
    if (zip) crc = updateCrc(crc, chunk);
    for (let offset = 0; offset < chunk.length; offset += 65_536)
      parser.write(decoder.decode(chunk.subarray(offset, offset + 65_536), { stream: true }));
  };
  const flush = async () => {
    if (isCancelled()) throw new ImportError('取り込みをキャンセルしました。');
    while (pending.length) {
      const batch = pending.splice(0, 100);
      await onBatch(await Promise.all(batch.map(identifyRun)));
      if (isCancelled()) throw new ImportError('取り込みをキャンセルしました。');
    }
  };
  const metadata = zip ? await zipMetadata(file) : undefined;
  let selectedCount = 0,
    entryCount = 0,
    exportComplete = false;
  const unzip = zip
    ? new Unzip((entry) => {
        if (++entryCount > IMPORT_LIMITS.zipEntries)
          throw new ImportError('ZIPの項目数が上限を超えています。');
        const selected = isExport(entry.name);
        if (selected && (++selectedCount > 1 || entry.name !== metadata?.name))
          throw new ImportError('ZIPのexport.xml情報が一致しません。');
        entry.ondata = (error, chunk, final) => {
          if (error)
            throw new ImportError('ZIPを展開できません。圧縮方式・破損を確認してください。');
          if (selected) {
            consume(chunk);
            if (final) exportComplete = true;
          }
        };
        entry.start();
      })
    : undefined;
  unzip?.register(SelectiveInflate);
  unzip?.register(SelectivePassThrough);
  const chunkSize = zip ? 4096 : 65_536;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    if (isCancelled()) throw new ImportError('取り込みをキャンセルしました。');
    const chunk = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
    if (unzip) unzip.push(chunk, offset + chunkSize >= file.size);
    else consume(chunk);
    await flush();
    onProgress(Math.min(100, Math.round(((offset + chunk.length) / file.size) * 100)));
  }
  if (
    metadata &&
    (!exportComplete ||
      selectedCount !== 1 ||
      expanded !== metadata.size ||
      (crc ^ 0xffffffff) >>> 0 !== metadata.crc)
  )
    throw new ImportError('ZIPの整合性検証に失敗しました。ファイルを再エクスポートしてください。');
  parser.write(decoder.decode());
  const report = parser.finish();
  await flush();
  return report;
}
