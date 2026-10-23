import { ImportError } from './errors';
import { Inflate } from 'fflate';
import { HealthParser, identifyRun, type ParseReport } from './parser';
import type { RunCandidate } from '../../domain/models/run';
import { IMPORT_EXPANDED_MAX_GB, IMPORT_FILE_MAX_MB, IMPORT_LIMITS } from './import-limits';
import { zipMetadata } from './zip-metadata';
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function updateCrc(crc: number, chunk: Uint8Array) {
  for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return crc;
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
  if (file.size > IMPORT_LIMITS.fileBytes)
    throw new ImportError(`ZIP・XMLは${IMPORT_FILE_MAX_MB} MBまで対応しています。`);
  const metadata = zip ? await zipMetadata(file) : undefined;
  const pending: Parameters<typeof identifyRun>[0][] = [];
  const parser = new HealthParser((run) => pending.push(run));
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let expanded = 0,
    crc = 0xffffffff;
  const consume = (chunk: Uint8Array) => {
    expanded += chunk.length;
    if (expanded > IMPORT_LIMITS.expandedXmlBytes)
      throw new ImportError(`展開後のXMLが${IMPORT_EXPANDED_MAX_GB} GBを超えています。`);
    if (metadata && expanded > metadata.size)
      throw new ImportError('ZIPの整合性検証に失敗しました。展開サイズが管理情報と一致しません。');
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
  const inflate = metadata?.compression === 8 ? new Inflate((chunk) => consume(chunk)) : undefined;
  const start = metadata?.dataStart ?? 0;
  const end = metadata?.dataEnd ?? file.size;
  const chunkSize = zip ? 4096 : 65_536;
  for (let offset = start; offset < end; offset += chunkSize) {
    if (isCancelled()) throw new ImportError('取り込みをキャンセルしました。');
    const chunk = new Uint8Array(
      await file.slice(offset, Math.min(offset + chunkSize, end)).arrayBuffer(),
    );
    try {
      if (inflate) inflate.push(chunk, offset + chunkSize >= end);
      else consume(chunk);
    } catch (error) {
      if (!zip || error instanceof ImportError) throw error;
      throw new ImportError('ZIPを展開できません。圧縮方式・破損を確認してください。');
    }
    await flush();
    onProgress(Math.min(100, Math.round(((offset - start + chunk.length) / (end - start)) * 100)));
  }
  if (metadata && (expanded !== metadata.size || (crc ^ 0xffffffff) >>> 0 !== metadata.crc))
    throw new ImportError('ZIPの整合性検証に失敗しました。ファイルを再エクスポートしてください。');
  parser.write(decoder.decode());
  const report = parser.finish();
  await flush();
  return report;
}
