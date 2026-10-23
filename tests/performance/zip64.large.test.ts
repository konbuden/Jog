import {
  appendFileSync,
  createReadStream,
  createWriteStream,
  mkdtempSync,
  openAsBlob,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32, createDeflateRaw } from 'node:zlib';
import { expect, it } from 'vitest';
import { syntheticXml } from '../fixtures/synthetic/xml';
import { zip64Parts } from '../fixtures/synthetic/zip64';
import { importHealthFile } from '../../src/infrastructure/apple-health/import-file';

it('5 GBちょうどに展開されるZIP64をメモリに全展開せず解析する', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mrc-zip64-'));
  const compressedPath = join(directory, 'synthetic.deflate');
  const zipPath = join(directory, 'synthetic.zip');
  const expandedBytes = 5_000_000_000;
  const prefix = Buffer.from('<HealthData>');
  const suffix = Buffer.from(syntheticXml(24).replace('<?xml version="1.0"?><HealthData>', ''));
  // Each comment stays below the parser's token bound. Only this small block is reused.
  const block = Buffer.from(`<!--${'x'.repeat(65_529)}-->`);
  let checksum = 0;
  function* chunks() {
    checksum = crc32(prefix, checksum);
    yield prefix;
    let remaining = expandedBytes - prefix.length - suffix.length;
    while (remaining >= block.length) {
      checksum = crc32(block, checksum);
      yield block;
      remaining -= block.length;
    }
    const padding = Buffer.alloc(remaining, 32);
    checksum = crc32(padding, checksum);
    yield padding;
    checksum = crc32(suffix, checksum);
    yield suffix;
  }
  try {
    await pipeline(
      Readable.from(chunks()),
      createDeflateRaw({ level: 1 }),
      createWriteStream(compressedPath),
    );
    const { header, footer } = zip64Parts(statSync(compressedPath).size, {
      expandedBytes,
      crc: checksum,
      dataDescriptor: true,
    });
    writeFileSync(zipPath, header);
    await pipeline(createReadStream(compressedPath), createWriteStream(zipPath, { flags: 'a' }));
    appendFileSync(zipPath, footer);
    const file = Object.assign(await openAsBlob(zipPath), { name: 'synthetic.zip' });
    expect(file.size).toBeLessThanOrEqual(200_000_000);
    const baseline = process.memoryUsage();
    let peakRss = baseline.rss;
    let peakHeap = baseline.heapUsed;
    let count = 0;
    const start = performance.now();
    const report = await importHealthFile(
      file,
      async (runs) => {
        count += runs.length;
      },
      () => {
        const current = process.memoryUsage();
        peakRss = Math.max(peakRss, current.rss);
        peakHeap = Math.max(peakHeap, current.heapUsed);
      },
    );
    expect(count).toBe(24);
    expect(report.runningCount).toBe(24);
    // Detect accidental retention of the 5 GB XML with generous CI headroom.
    expect(peakRss - baseline.rss).toBeLessThan(512 * 1024 * 1024);
    writeFileSync(
      join(tmpdir(), 'my-running-coach-zip64-performance.json'),
      JSON.stringify(
        {
          inputBytes: file.size,
          expandedBytes,
          seconds: +((performance.now() - start) / 1000).toFixed(2),
          peakRssMiB: +(peakRss / 1024 / 1024).toFixed(1),
          addedRssMiB: +((peakRss - baseline.rss) / 1024 / 1024).toFixed(1),
          addedHeapMiB: +((peakHeap - baseline.heapUsed) / 1024 / 1024).toFixed(1),
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 600_000);
