import { SaxesParser } from 'saxes';
import { ImportError } from './errors';
import type { RunRoute } from '../../domain/models/run';

/** Preserve segment breaks and bound retained GPS points with progressive downsampling. */
export class GpxParser {
  private parser = new SaxesParser({ xmlns: true });
  private segments: [number, number][][] = [];
  private current: [number, number][] | undefined;
  private count = 0;
  private stride = 1;
  private root = false;
  private depth = 0;
  private lastPosition = 0;
  private last: [number, number] | undefined;
  constructor() {
    const mark = () => {
      this.lastPosition = this.parser.position;
    };
    this.parser.on('error', () => {
      throw new ImportError('GPXの形式が不正です。');
    });
    this.parser.on('doctype', () => {
      throw new ImportError('GPXの外部参照・DTDには対応していません。');
    });
    this.parser.on('opentag', (tag) => {
      mark();
      if (++this.depth > 32) throw new ImportError('GPXの階層が深すぎます。');
      if (this.depth === 1) {
        if (tag.local !== 'gpx') throw new ImportError('GPX形式ではありません。');
        this.root = true;
      }
      if (tag.local === 'trkseg' || tag.local === 'rte') {
        this.finishSegment();
        this.current = [];
        if (this.segments.length >= 64) throw new ImportError('GPXの区間数が上限を超えています。');
        this.segments.push(this.current);
      }
      if (tag.local === 'trkpt' || tag.local === 'rtept') {
        const rawLat = tag.attributes.lat?.value,
          rawLon = tag.attributes.lon?.value;
        const lat = rawLat?.trim() ? Number(rawLat) : NaN,
          lon = rawLon?.trim() ? Number(rawLon) : NaN;
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lon) ||
          Math.abs(lat) > 90 ||
          Math.abs(lon) > 180
        )
          throw new ImportError('GPXの座標が不正です。');
        if (!this.current) {
          this.current = [];
          if (this.segments.length >= 64)
            throw new ImportError('GPXの区間数が上限を超えています。');
          this.segments.push(this.current);
        }
        this.count++;
        this.last = [lat, lon];
        if ((this.count - 1) % this.stride === 0) this.current.push(this.last);
        if (this.segments.reduce((sum, s) => sum + s.length, 0) > 2000) {
          this.segments = this.segments.map((s) => s.filter((_, i) => i % 2 === 0));
          this.current = this.segments.at(-1);
          this.stride *= 2;
        }
      }
    });
    this.parser.on('closetag', (tag) => {
      mark();
      if (tag.local === 'trkseg' || tag.local === 'rte') {
        this.finishSegment();
        this.current = undefined;
      }
      this.depth--;
    });
    this.parser.on('text', mark);
    this.parser.on('comment', mark);
    this.parser.on('processinginstruction', mark);
  }
  private finishSegment() {
    if (this.last && this.current && this.current.at(-1) !== this.last)
      this.current.push(this.last);
    this.last = undefined;
  }
  write(text: string) {
    this.parser.write(text);
    if (this.parser.position - this.lastPosition > 262144)
      throw new ImportError('GPXの要素が大きすぎます。');
  }
  finish(id: string): RunRoute {
    this.parser.close();
    this.finishSegment();
    if (!this.root || !this.count) throw new ImportError('GPXにコース座標がありません。');
    return {
      id,
      segments: this.segments.filter((s) => s.length),
      pointCount: this.count,
      sampled: this.stride > 1,
    };
  }
}
export function routeEntryName(exportName: string, reference: string): string | null {
  if (
    reference.includes('\\') ||
    reference.includes(':') ||
    reference.split('/').includes('..') ||
    !/\.gpx$/i.test(reference)
  )
    return null;
  const relative = reference.replace(/^\/+/, '').replace(/^\.\//, '');
  const prefix = exportName.slice(0, exportName.lastIndexOf('/') + 1);
  return relative.startsWith(prefix) ? relative : prefix + relative;
}
