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
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
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

it('200 MBちょうどの合成XML・ZIPを逐次解析する', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mrc-boundary-'));
  const size = 200_000_000;
  const xmlPath = join(directory, 'export.xml');
  const zipPath = join(directory, 'export.zip');
  const payload = strToU8(syntheticXml(24));
  try {
    const xmlFd = openSync(xmlPath, 'w');
    const padding = new Uint8Array(65_536).fill(32);
    writeSync(xmlFd, payload.subarray(0, payload.length - '</HealthData>'.length));
    let remaining = size - payload.length;
    // Short ignored elements keep XML token limits in force while padding to the exact size.
    const ignored = strToU8('<Record/>'.repeat(4096));
    while (remaining >= ignored.length) {
      writeSync(xmlFd, ignored);
      remaining -= ignored.length;
    }
    writeSync(xmlFd, padding.subarray(0, remaining));
    writeSync(xmlFd, '</HealthData>');
    closeSync(xmlFd);

    const names = ['apple_health_export/export.xml', 'apple_health_export/routes/ignored.gpx'];
    // Measure streaming headers/descriptors with empty padding before writing the large archive.
    let overhead = 0;
    const measure = new Zip((error, bytes) => {
      if (error) throw error;
      overhead += bytes.length;
    });
    for (const [name, data] of [
      [names[0]!, payload],
      [names[1]!, new Uint8Array()],
    ] as const) {
      const entry = new ZipPassThrough(name);
      measure.add(entry);
      entry.push(data, true);
    }
    measure.end();
    const zipFd = openSync(zipPath, 'w');
    const archive = new Zip((error, bytes) => {
      if (error) throw error;
      writeSync(zipFd, bytes);
    });
    const health = new ZipPassThrough(names[0]!);
    archive.add(health);
    health.push(payload, true);
    const unrelated = new ZipPassThrough(names[1]!);
    archive.add(unrelated);
    remaining = size - overhead;
    while (remaining > 0) {
      const length = Math.min(remaining, padding.length);
      remaining -= length;
      unrelated.push(padding.subarray(0, length), remaining === 0);
    }
    archive.end();
    closeSync(zipFd);

    for (const [path, name] of [
      [xmlPath, 'export.xml'],
      [zipPath, 'export.zip'],
    ]) {
      const input = Object.assign(await openAsBlob(path!), { name: name! });
      expect(input.size).toBe(size);
      let count = 0;
      const report = await importHealthFile(input, async (runs) => {
        count += runs.length;
      });
      expect(report.runningCount).toBe(24);
      expect(count).toBe(24);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
