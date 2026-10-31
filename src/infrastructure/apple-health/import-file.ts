import { ImportError } from './errors';
import { Inflate } from 'fflate';
import { HealthParser, identifyRun, type ParseReport } from './parser';
import type { RunCandidate, RunRoute } from '../../domain/models/run';
import { IMPORT_EXPANDED_MAX_GB, IMPORT_FILE_MAX_MB, IMPORT_LIMITS } from './import-limits';
import { zipMetadata, type ZipTarget } from './zip-metadata';
import { GpxParser, routeEntryName } from './gpx';
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
  onBatch: (runs: RunCandidate[]) => Promise<void | ReadonlyMap<string, string>>,
  onProgress: (percent: number) => void = () => {},
  isCancelled: () => boolean = () => false,
  onRoute: (route: RunRoute) => Promise<void> = async () => {},
): Promise<ParseReport> {
  const zip = /\.zip$/i.test(file.name),
    xml = /\.xml$/i.test(file.name);
  if (!zip && !xml) throw new ImportError('ZIPまたはXMLファイルを選択してください。');
  if (file.size === 0) throw new ImportError('ファイルが空です。');
  if (file.size > IMPORT_LIMITS.fileBytes)
    throw new ImportError(`ZIP・XMLは${IMPORT_FILE_MAX_MB} MBまで対応しています。`);
  const metadata = zip ? await zipMetadata(file) : undefined;
  const routes = new Map<string, { id: string; files: string[] }>();
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
      const candidates = await Promise.all(batch.map(identifyRun));
      const selected = await onBatch(candidates);
      for (const run of candidates)
        if (run.details?.routeFiles?.length && (selected === undefined || selected.has(run.id))) {
          const target = selected?.get(run.id) ?? run.id;
          if (routes.has(target)) continue;
          if (routes.size < 10_000)
            routes.set(target, { id: target, files: run.details.routeFiles });
          else {
            const message = 'コースを含む記録は1回のインポートにつき10000件まで対応しています';
            parser.report.warnings[message] = (parser.report.warnings[message] ?? 0) + 1;
          }
        }
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
  const warn = (message: string) => {
    report.warnings[message] = (report.warnings[message] ?? 0) + 1;
  };
  let routeBytes = 0;
  for (const run of routes.values()) {
    if (!metadata) {
      warn('XML単体ではコースを読み込めません。GPXを含む元のZIPを再インポートしてください');
      continue;
    }
    let combined: RunRoute | undefined;
    let incomplete = false;
    for (const reference of run.files) {
      if (isCancelled()) throw new ImportError('取り込みをキャンセルしました。');
      try {
        const name = routeEntryName(metadata.name, reference);
        if (!name) throw new ImportError('コース参照パスが不正です。');
        const target = await zipMetadata(file, name);
        routeBytes += target.size;
        if (routeBytes > 200_000_000)
          throw new ImportError('コース全体の展開量が200 MBを超えています。');
        const route = await readRoute(file, target, run.id, isCancelled);
        if (!combined) combined = route;
        else {
          if (combined.segments.length + route.segments.length > 64)
            throw new ImportError('コース区間数が上限を超えています。');
          combined.segments.push(...route.segments);
          combined.pointCount += route.pointCount;
          combined.sampled ||= route.sampled;
        }
      } catch (error) {
        if (isCancelled()) throw error;
        incomplete = true;
        warn('一部のコースを読み込めませんでした（参照先なし・不正・容量超過など）');
      }
    }
    if (combined) {
      combined.incomplete = incomplete;
      while (combined.segments.reduce((sum, s) => sum + s.length, 0) > 2200) {
        combined.segments = combined.segments.map((s) =>
          s.filter((_, i) => i === 0 || i === s.length - 1 || i % 2 === 0),
        );
        combined.sampled = true;
      }
      await onRoute(combined);
    }
  }
  onProgress(100);
  return report;
}

async function readRoute(
  file: Blob,
  target: ZipTarget,
  id: string,
  isCancelled: () => boolean,
): Promise<RunRoute> {
  const parser = new GpxParser();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let expanded = 0,
    crc = 0xffffffff;
  const consume = (chunk: Uint8Array) => {
    expanded += chunk.length;
    if (expanded > 20_000_000 || expanded > target.size)
      throw new ImportError('GPXの展開量が上限を超えています。');
    crc = updateCrc(crc, chunk);
    for (let offset = 0; offset < chunk.length; offset += 65536)
      parser.write(decoder.decode(chunk.subarray(offset, offset + 65536), { stream: true }));
  };
  const inflate = target.compression === 8 ? new Inflate(consume) : undefined;
  for (let offset = target.dataStart; offset < target.dataEnd; offset += 4096) {
    if (isCancelled()) throw new ImportError('取り込みをキャンセルしました。');
    const end = Math.min(offset + 4096, target.dataEnd);
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    if (inflate) inflate.push(chunk, end === target.dataEnd);
    else consume(chunk);
  }
  if (expanded !== target.size || (crc ^ 0xffffffff) >>> 0 !== target.crc)
    throw new ImportError('GPXの整合性検証に失敗しました。');
  parser.write(decoder.decode());
  return parser.finish(id);
}
