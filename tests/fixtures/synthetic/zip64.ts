import { crc32, deflateRawSync } from 'node:zlib';

export interface SyntheticZip64Options {
  expandedBytes?: number;
  crc?: number;
  dataDescriptor?: boolean;
  endRecords?: boolean;
  sizeOnly?: boolean;
}

/** Synthetic ZIP headers, also usable with a compressed stream stored in a temporary file. */
export function zip64Parts(compressedBytes: number, options: SyntheticZip64Options) {
  const expanded = options.expandedBytes ?? 0;
  const checksum = options.crc ?? 0;
  const descriptor = options.dataDescriptor ?? false;
  const endRecords = options.endRecords ?? true;
  const sizeOnly = options.sizeOnly ?? false;
  const name = Buffer.from('apple_health_export/export.xml');
  const extra = (central: boolean) => {
    const values = sizeOnly
      ? [expanded]
      : central
        ? [expanded, compressedBytes, 0]
        : [expanded, compressedBytes];
    const result = Buffer.alloc(4 + values.length * 8);
    result.writeUInt16LE(1);
    result.writeUInt16LE(values.length * 8, 2);
    values.forEach((value, index) => result.writeBigUInt64LE(BigInt(value), 4 + index * 8));
    return result;
  };
  const localExtra = extra(false);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(45, 4);
  local.writeUInt16LE(0x800 | (descriptor ? 8 : 0), 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(descriptor ? 0 : checksum, 14);
  local.writeUInt32LE(sizeOnly ? compressedBytes : 0xffffffff, 18);
  local.writeUInt32LE(0xffffffff, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(localExtra.length, 28);
  const header = Buffer.concat([local, name, localExtra]);
  const dd = Buffer.alloc(descriptor ? 24 : 0);
  if (descriptor) {
    dd.writeUInt32LE(0x08074b50);
    dd.writeUInt32LE(checksum, 4);
    dd.writeBigUInt64LE(BigInt(compressedBytes), 8);
    dd.writeBigUInt64LE(BigInt(expanded), 16);
  }
  const centralExtra = extra(true);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(45, 4);
  central.writeUInt16LE(45, 6);
  central.writeUInt16LE(0x800 | (descriptor ? 8 : 0), 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(sizeOnly ? compressedBytes : 0xffffffff, 20);
  central.writeUInt32LE(0xffffffff, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(centralExtra.length, 30);
  central.writeUInt32LE(sizeOnly ? 0 : 0xffffffff, 42);
  const directory = Buffer.concat([central, name, centralExtra]);
  const directoryOffset = header.length + compressedBytes + dd.length;
  const end64 = Buffer.alloc(endRecords ? 56 : 0);
  const locator = Buffer.alloc(endRecords ? 20 : 0);
  if (endRecords) {
    end64.writeUInt32LE(0x06064b50);
    end64.writeBigUInt64LE(44n, 4);
    end64.writeUInt16LE(45, 12);
    end64.writeUInt16LE(45, 14);
    end64.writeBigUInt64LE(1n, 24);
    end64.writeBigUInt64LE(1n, 32);
    end64.writeBigUInt64LE(BigInt(directory.length), 40);
    end64.writeBigUInt64LE(BigInt(directoryOffset), 48);
    locator.writeUInt32LE(0x07064b50);
    locator.writeBigUInt64LE(BigInt(directoryOffset + directory.length), 8);
    locator.writeUInt32LE(1, 16);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(endRecords ? 0xffff : 1, 8);
  end.writeUInt16LE(endRecords ? 0xffff : 1, 10);
  end.writeUInt32LE(endRecords ? 0xffffffff : directory.length, 12);
  end.writeUInt32LE(endRecords ? 0xffffffff : directoryOffset, 16);
  return { header, footer: Buffer.concat([dd, directory, end64, locator, end]) };
}

export function syntheticZip64(xml: string, options: SyntheticZip64Options = {}) {
  const data = Buffer.from(xml);
  const compressed = deflateRawSync(data);
  const { header, footer } = zip64Parts(compressed.length, {
    expandedBytes: data.length,
    crc: crc32(data),
    ...options,
  });
  return Buffer.concat([header, compressed, footer]);
}
