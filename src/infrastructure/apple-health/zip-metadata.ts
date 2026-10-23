import { ImportError } from './errors';
import { IMPORT_EXPANDED_MAX_GB, IMPORT_LIMITS } from './import-limits';

const invalid = () => new ImportError('ZIPの管理情報が不正か、途中で切れています。');
const split = () => new ImportError('分割ZIPには対応していません。');
const isExport = (name: string) =>
  /(^|\/)export\.xml$/i.test(name) && !name.split('/').includes('..');

function uint64(view: DataView, offset: number, end = view.byteLength): number {
  if (offset < 0 || offset + 8 > end) throw invalid();
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
  return Number(value);
}

async function read(file: Blob, offset: number, size: number) {
  if (offset < 0 || size < 0 || offset + size > file.size) throw invalid();
  const bytes = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
  if (bytes.length !== size) throw invalid();
  return bytes;
}

/** ZIP64 extra fields contain only the legacy values that overflowed, in their defined order. */
function sizes(
  view: DataView,
  start: number,
  length: number,
  expanded: number,
  compressed: number,
  offset: number,
  disk = 0,
) {
  const end = start + length;
  let zip64: { start: number; end: number } | undefined;
  for (let cursor = start; cursor < end;) {
    if (cursor + 4 > end) throw invalid();
    const next = cursor + 4 + view.getUint16(cursor + 2, true);
    if (next > end) throw invalid();
    if (view.getUint16(cursor, true) === 1) {
      if (zip64) throw invalid();
      zip64 = { start: cursor + 4, end: next };
    }
    cursor = next;
  }
  const needs64 = [expanded, compressed, offset].includes(0xffffffff) || disk === 0xffff;
  if (needs64) {
    if (!zip64) throw invalid();
    let cursor = zip64.start;
    const next = () => {
      const value = uint64(view, cursor, zip64.end);
      cursor += 8;
      return value;
    };
    if (expanded === 0xffffffff) expanded = next();
    if (compressed === 0xffffffff) compressed = next();
    if (offset === 0xffffffff) offset = next();
    if (disk === 0xffff) {
      if (cursor + 4 > zip64.end) throw invalid();
      disk = view.getUint32(cursor, true);
    }
  }
  if (disk !== 0) throw split();
  return { expanded, compressed, offset };
}

async function directoryLocation(file: Blob) {
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
  if (view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true)) throw split();
  let entries = view.getUint16(eocd + 10, true);
  if (view.getUint16(eocd + 8, true) !== entries) throw split();
  let size = view.getUint32(eocd + 12, true);
  let offset = view.getUint32(eocd + 16, true);
  let boundary = file.size - tail.length + eocd;
  // Some writers use ZIP64 only on individual entries, others also emit ZIP64 end records.
  const locator = boundary >= 20 ? await read(file, boundary - 20, 20) : undefined;
  if (locator && new DataView(locator.buffer).getUint32(0, true) === 0x07064b50) {
    const loc = new DataView(locator.buffer);
    if (loc.getUint32(4, true) !== 0 || loc.getUint32(16, true) !== 1) throw split();
    const recordOffset = uint64(loc, 8);
    const record = new DataView((await read(file, recordOffset, 56)).buffer);
    if (
      record.getUint32(0, true) !== 0x06064b50 ||
      uint64(record, 4) < 44 ||
      recordOffset + 12 + uint64(record, 4) !== boundary - 20
    )
      throw invalid();
    if (record.getUint32(16, true) || record.getUint32(20, true)) throw split();
    const total = uint64(record, 32);
    if (uint64(record, 24) !== total) throw split();
    const directorySize = uint64(record, 40);
    const directoryOffset = uint64(record, 48);
    if (
      (entries !== 0xffff && entries !== total) ||
      (size !== 0xffffffff && size !== directorySize) ||
      (offset !== 0xffffffff && offset !== directoryOffset)
    )
      throw invalid();
    entries = total;
    size = directorySize;
    offset = directoryOffset;
    boundary = recordOffset;
  } else if (entries === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw invalid();
  if (entries > IMPORT_LIMITS.zipEntries || size > IMPORT_LIMITS.centralDirectoryBytes)
    throw new ImportError('ZIPの項目数・管理情報が上限を超えています。');
  if (offset + size > boundary) throw invalid();
  return { entries, size, offset };
}

export interface ZipTarget {
  name: string;
  crc: number;
  size: number;
  compression: number;
  dataStart: number;
  dataEnd: number;
}

/** Read bounded metadata and only the selected entry. No full archive or XML is retained. */
const directories = new WeakMap<
  Blob,
  Promise<{
    location: Awaited<ReturnType<typeof directoryLocation>>;
    bytes: Uint8Array<ArrayBuffer>;
  }>
>();
async function directory(file: Blob) {
  let pending = directories.get(file);
  if (!pending) {
    pending = (async () => {
      const location = await directoryLocation(file);
      return { location, bytes: await read(file, location.offset, location.size) };
    })();
    directories.set(file, pending);
  }
  return pending;
}
export async function zipMetadata(file: Blob, requestedName?: string): Promise<ZipTarget> {
  const { location, bytes } = await directory(file);
  const central = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  let position = 0;
  let target:
    | {
        name: string;
        crc: number;
        size: number;
        compressed: number;
        offset: number;
        flags: number;
        compression: number;
      }
    | undefined;
  for (let index = 0; index < location.entries; index++) {
    if (position + 46 > bytes.length || central.getUint32(position, true) !== 0x02014b50)
      throw invalid();
    const nameLength = central.getUint16(position + 28, true);
    const extraLength = central.getUint16(position + 30, true);
    const end = position + 46 + nameLength + extraLength + central.getUint16(position + 32, true);
    if (end > bytes.length) throw invalid();
    const values = sizes(
      central,
      position + 46 + nameLength,
      extraLength,
      central.getUint32(position + 24, true),
      central.getUint32(position + 20, true),
      central.getUint32(position + 42, true),
      central.getUint16(position + 34, true),
    );
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    if (requestedName ? name === requestedName : isExport(name)) {
      if (target)
        throw new ImportError('export.xmlが複数あります。対象XMLを直接選択してください。');
      const flags = central.getUint16(position + 8, true);
      if (flags & 0x41) throw new ImportError('暗号化ZIPには対応していません。');
      const compression = central.getUint16(position + 10, true);
      if (compression !== 0 && compression !== 8)
        throw new ImportError('このZIP圧縮方式には対応していません。');
      if (values.expanded > (requestedName ? 20_000_000 : IMPORT_LIMITS.expandedXmlBytes))
        throw new ImportError(
          requestedName
            ? 'コースファイルは展開後20 MBまで対応しています。'
            : `展開後のXMLが${IMPORT_EXPANDED_MAX_GB} GBを超えています。`,
        );
      target = {
        name,
        flags,
        compression,
        crc: central.getUint32(position + 16, true),
        size: values.expanded,
        compressed: values.compressed,
        offset: values.offset,
      };
    }
    position = end;
  }
  if (position !== bytes.length) throw invalid();
  if (!target) throw new ImportError('ZIP内にexport.xmlが見つかりません。');
  if (target.offset + 30 > location.offset) throw invalid();
  const local = new DataView((await read(file, target.offset, 30)).buffer);
  if (
    local.getUint32(0, true) !== 0x04034b50 ||
    local.getUint16(6, true) !== target.flags ||
    local.getUint16(8, true) !== target.compression
  )
    throw invalid();
  const nameLength = local.getUint16(26, true);
  const extraLength = local.getUint16(28, true);
  const dataStart = target.offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + target.compressed;
  if (dataEnd > location.offset || (target.compression === 0 && target.compressed !== target.size))
    throw invalid();
  const localNameExtra = await read(file, target.offset + 30, nameLength + extraLength);
  if (decoder.decode(localNameExtra.subarray(0, nameLength)) !== target.name) throw invalid();
  if (!(target.flags & 8)) {
    const values = sizes(
      new DataView(localNameExtra.buffer),
      nameLength,
      extraLength,
      local.getUint32(22, true),
      local.getUint32(18, true),
      0,
    );
    if (
      values.expanded !== target.size ||
      values.compressed !== target.compressed ||
      local.getUint32(14, true) !== target.crc
    )
      throw invalid();
  }
  return {
    name: target.name,
    crc: target.crc,
    size: target.size,
    compression: target.compression,
    dataStart,
    dataEnd,
  };
}
