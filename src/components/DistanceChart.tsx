import { useId } from 'react';
import { formatKm } from './format';

export function DistanceChart({
  data,
  selectedMonth,
  goalKm = 100,
}: {
  data: { month: string; distanceMeters: number; count: number }[];
  selectedMonth: string;
  goalKm?: number;
}) {
  const id = useId();
  const maxKm = Math.max(
    goalKm,
    Math.ceil(Math.max(...data.map((item) => item.distanceMeters / 1000), 0) / 25) * 25,
  );
  const left = 42,
    width = 620,
    height = 174,
    top = 20,
    step = width / data.length;
  return (
    <figure className="chart-figure">
      <svg viewBox="0 0 680 242" role="img" aria-labelledby={id} className="distance-chart">
        <title id={id}>
          月間走行距離の推移。
          {data.map((item) => `${item.month}、${formatKm(item.distanceMeters)}km`).join('。')}
        </title>
        {[0, 1, 2, 3, 4].map((index) => {
          const y = top + height * (1 - index / 4);
          return (
            <g key={index}>
              <line x1={left} x2="668" y1={y} y2={y} className="grid-line" />
              <text x="29" y={y + 4} textAnchor="end" className="axis-label">
                {(maxKm * index) / 4}
              </text>
            </g>
          );
        })}
        <text x="5" y="10" className="axis-label">
          km
        </text>
        {data.map((item, index) => {
          const barHeight = (item.distanceMeters / 1000 / maxKm) * height;
          return (
            <g key={item.month}>
              <rect
                x={left + step * index + step * 0.27}
                y={top + height - Math.max(barHeight, 2)}
                width={step * 0.46}
                height={Math.max(barHeight, 2)}
                rx="5"
                className={item.month === selectedMonth ? 'bar current' : 'bar'}
              >
                <title>
                  {item.month}：{formatKm(item.distanceMeters)}km・{item.count}回
                </title>
              </rect>
              <text
                x={left + step * (index + 0.5)}
                y="222"
                textAnchor="middle"
                className={
                  item.month === selectedMonth ? 'axis-label selected-label' : 'axis-label'
                }
              >
                {index % Math.max(1, Math.ceil(data.length / 8)) === 0 || index === data.length - 1
                  ? data.length > 12
                    ? item.month.replace('-', '/')
                    : `${Number(item.month.slice(5))}月`
                  : ''}
              </text>
            </g>
          );
        })}
        <line
          x1={left}
          x2="668"
          y1={top + height - (goalKm / maxKm) * height}
          y2={top + height - (goalKm / maxKm) * height}
          className="goal-line"
        />
      </svg>
      <figcaption className="chart-caption">
        <span>
          <i className="legend-square" />
          月間走行距離
        </span>
        <span>
          <i className="legend-dash" />
          目標 {goalKm.toLocaleString('ja-JP')}km
        </span>
      </figcaption>
      <details className="chart-data">
        <summary>グラフの数値を見る</summary>
        <table>
          <caption className="sr-only">月間走行距離の数値</caption>
          <thead>
            <tr>
              <th>月</th>
              <th>距離</th>
              <th>回数</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.month}>
                <td>{item.month}</td>
                <td>{formatKm(item.distanceMeters)} km</td>
                <td>{item.count}回</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
