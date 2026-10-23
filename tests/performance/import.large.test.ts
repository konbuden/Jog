import {
  closeSync,
  mkdtempSync,
  openAsBlob,
  openSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Zip, ZipDeflate } from 'fflate';
import { expect, it } from 'vitest';
import { importHealthFile } from '../../src/infrastructure/apple-health/import-file';
import { syntheticXml } from '../fixtures/synthetic/xml';

it('100 MiBの合成XMLと同内容のZIPを逐次解析する', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mrc-synthetic-'));
  const record =
    '<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Synthetic" value="135" unit="count/min" startDate="2026-10-01 10:00:00 +0900" endDate="2026-10-01 10:00:00 +0900"/>';
  const block = new TextEncoder().encode(record.repeat(1024));
  const blocks = Math.ceil((100 * 1024 * 1024) / block.length);
  const xmlPath = join(directory, 'export.xml'),
    zipPath = join(directory, 'export.zip');
  const xmlFd = openSync(xmlPath, 'w'),
    zipFd = openSync(zipPath, 'w');
  const archive = new Zip((error, bytes) => {
    if (error) throw error;
    writeSync(zipFd, bytes);
  });
  const entry = new ZipDeflate('apple_health_export/export.xml', { level: 6 });
  archive.add(entry);
  const emit = (text: string | Uint8Array, final = false) => {
    const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
    writeSync(xmlFd, bytes);
    entry.push(bytes, final);
  };
  try {
    emit('<HealthData>');
    for (let index = 0; index < blocks; index++) emit(block);
    emit(syntheticXml(24).replace('<?xml version="1.0"?><HealthData>', ''), true);
    archive.end();
    closeSync(xmlFd);
    closeSync(zipFd);
    const measurements: unknown[] = [];
    for (const [path, name] of [
      [xmlPath, 'export.xml'],
      [zipPath, 'export.zip'],
    ]) {
      const blob = Object.assign(await openAsBlob(path!), { name: name! });
      const baseline = process.memoryUsage();
      let peakRss = baseline.rss,
        peakHeap = baseline.heapUsed,
        count = 0;
      const start = performance.now();
      const report = await importHealthFile(
        blob,
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
      measurements.push({
        format: name,
        inputMiB: +(blob.size / 1024 / 1024).toFixed(2),
        expandedMiB: +((block.length * blocks) / 1024 / 1024).toFixed(2),
        seconds: +((performance.now() - start) / 1000).toFixed(2),
        peakRssMiB: +(peakRss / 1024 / 1024).toFixed(1),
        addedRssMiB: +((peakRss - baseline.rss) / 1024 / 1024).toFixed(1),
        addedHeapMiB: +((peakHeap - baseline.heapUsed) / 1024 / 1024).toFixed(1),
      });
    }
    writeFileSync(
      join(tmpdir(), 'my-running-coach-performance.json'),
      JSON.stringify(measurements, null, 2),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
