import type { RunRoute } from '../models/run';
/** Local projection only. Unwrap longitude around the first point for dateline crossings. */
export function routeGeometry(route: RunRoute) {
  const first = route.segments.find((s) => s.length)?.[0];
  if (!first) return [];
  const projected = route.segments.map((segment) =>
    segment.map(([lat, lon]) => {
      const longitude = first[1] + ((lon - first[1] + 540) % 360) - 180;
      const latitude = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
      return [(longitude * Math.PI) / 180, Math.log(Math.tan(Math.PI / 4 + latitude / 2))] as const;
    }),
  );
  const points = projected.flat();
  const minX = Math.min(...points.map((p) => p[0])),
    maxX = Math.max(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1])),
    maxY = Math.max(...points.map((p) => p[1]));
  const scale = Math.min(568 / Math.max(maxX - minX, 1e-8), 288 / Math.max(maxY - minY, 1e-8));
  return projected.map((s) =>
    s.map(
      ([x, y]) =>
        [300 + (x - (minX + maxX) / 2) * scale, 160 - (y - (minY + maxY) / 2) * scale] as [
          number,
          number,
        ],
    ),
  );
}
