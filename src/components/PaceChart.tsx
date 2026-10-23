import { useId } from 'react';
import { formatPace } from './format';

export function PaceChart({
  data,
  label,
  heartRate = false,
}: {
  data: { month: string; paceSecondsPerKm: number | null; count: number }[];
  label: string;
  heartRate?: boolean;
}) {
  const id = useId();
  const values = data.flatMap((item) =>
    item.paceSecondsPerKm === null ? [] : [item.paceSecondsPerKm],
  );
  const min = values.length ? Math.max(0, Math.floor(Math.min(...values) / 30) * 30 - 30) : 300;
  const max = values.length ? Math.ceil(Math.max(...values) / 30) * 30 + 30 : 480;
  const x = (index: number) => 57 + (index / Math.max(1, data.length - 1)) * 483;
  const y = (value: number) => 25 + ((value - min) / (max - min)) * 140;
  let connected = false;
  const path = data
    .map((item, index) => {
      if (item.paceSecondsPerKm === null) {
        connected = false;
        return '';
      }
      const point = `${connected ? 'L' : 'M'}${x(index)},${y(item.paceSecondsPerKm)}`;
      connected = true;
      return point;
    })
    .join(' ');
  return (
    <figure className={`chart-figure pace-chart${heartRate ? ' heart-chart' : ''}`}>
      <svg viewBox="0 0 560 215" role="img" aria-labelledby={id}>
        <title id={id}>
          {label}。
          {data
            .map((item) => `${item.month}：${formatPace(item.paceSecondsPerKm)}、${item.count}回`)
            .join('。')}
        </title>
        {[0, 1, 2, 3, 4].map((index) => {
          const value = min + ((max - min) * index) / 4;
          return (
            <g key={index}>
              <line x1="57" x2="540" y1={y(value)} y2={y(value)} className="grid-line" />
              <text x="45" y={y(value) + 4} className="axis-label" textAnchor="end">
                {formatPace(value)}
              </text>
            </g>
          );
        })}
        <path d={path} className="pace-line" />
        {data.map((item, index) => (
          <g key={item.month}>
            {item.paceSecondsPerKm !== null && (
              <circle cx={x(index)} cy={y(item.paceSecondsPerKm)} r="4" className="pace-dot">
                <title>
                  {item.month}：{formatPace(item.paceSecondsPerKm)}/km・{item.count}回
                </title>
              </circle>
            )}
            {(index % 2 === 0 || index === data.length - 1) && (
              <text x={x(index)} y="195" textAnchor="middle" className="axis-label">
                {Number(item.month.slice(5))}月
              </text>
            )}
          </g>
        ))}
        {values.length === 0 && (
          <text x="300" y="100" textAnchor="middle" className="axis-label">
            この期間の対象データはありません
          </text>
        )}
      </svg>
      <figcaption className="pace-caption">
        上にあるほど速いペース・欠損月は線でつなぎません
      </figcaption>
      <details className="chart-data">
        <summary>グラフの数値を見る</summary>
        <table>
          <caption className="sr-only">{label}の数値</caption>
          <thead>
            <tr>
              <th>月</th>
              <th>平均ペース</th>
              <th>対象</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.month}>
                <td>{item.month}</td>
                <td>
                  {formatPace(item.paceSecondsPerKm)}
                  {item.paceSecondsPerKm !== null && ' /km'}
                </td>
                <td>{item.count}回</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
