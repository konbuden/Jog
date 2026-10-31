export const formatKm = (meters: number) =>
  (meters / 1000).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export function formatPace(seconds: number | null): string {
  if (seconds === null) return '—';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}′${String(rounded % 60).padStart(2, '0')}″`;
}
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const value = Math.round(seconds),
    h = Math.floor(value / 3600),
    m = Math.floor((value % 3600) / 60),
    s = String(value % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
export const formatHeartRate = (value: number | null) =>
  value === null ? 'データなし' : `${Math.round(value)} bpm`;

export const formatTime = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
