export const TIME_ZONE = 'Asia/Tokyo';
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

export function monthKey(time: string | Date): string {
  return new Date(new Date(time).getTime() + TOKYO_OFFSET_MS).toISOString().slice(0, 7);
}

export function dateKey(time: string): string {
  return new Date(new Date(time).getTime() + TOKYO_OFFSET_MS).toISOString().slice(0, 10);
}

export function recentMonths(now: Date, count: number): string[] {
  const [year, month] = monthKey(now).split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(year, month - count + index, 1)).toISOString().slice(0, 7),
  );
}

/** Never let the host timezone or Date's calendar overflow determine imported dates. */
export function parseHealthDate(value: string): { iso: string; offsetMinutes: number } | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?\s*(Z|[+-]\d{2}:?\d{2})$/.exec(
      value,
    );
  if (!match) return null;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const hour = Number(match[4]),
    minute = Number(match[5]),
    second = Number(match[6]);
  const zone = match[8]!;
  const zoneDigits = zone.replace(':', '');
  const zoneHours = zone === 'Z' ? 0 : Number(zoneDigits.slice(1, 3));
  const zoneMinutes = zone === 'Z' ? 0 : Number(zoneDigits.slice(3, 5));
  if (
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    zoneHours > 14 ||
    zoneMinutes > 59 ||
    (zoneHours === 14 && zoneMinutes !== 0)
  )
    return null;
  const local = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, Number((match[7] ?? '').padEnd(3, '0'))),
  );
  if (local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) return null;
  const offsetMinutes = (zone.startsWith('-') ? -1 : 1) * (zoneHours * 60 + zoneMinutes);
  return { iso: new Date(local.getTime() - offsetMinutes * 60_000).toISOString(), offsetMinutes };
}
