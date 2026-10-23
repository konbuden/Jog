import type { MonthSelection } from '../domain/analytics/period';
import { validMonth } from '../domain/analytics/period';
export function MonthSelector({
  value,
  onChange,
}: {
  value: MonthSelection;
  onChange: (value: MonthSelection) => void;
}) {
  const input = (key: 'from' | 'through', label: string) => (
    <label>
      {label}
      <span className="period-month">
        <span aria-hidden="true">
          {value[key].slice(0, 4)}年{Number(value[key].slice(5))}月 ▾
        </span>
        <input
          type="month"
          aria-label={label}
          min="1900-01"
          max="9999-12"
          value={value[key]}
          onChange={(e) => {
            if (validMonth(e.target.value)) onChange({ ...value, [key]: e.target.value });
          }}
        />
      </span>
    </label>
  );
  return (
    <div className="period-selector" aria-label="対象月の選択">
      <label>
        対象月
        <select
          aria-label="対象月の選択方法"
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as MonthSelection['mode'] })}
        >
          <option value="single">単月</option>
          <option value="range">複数月</option>
          <option value="all">全期間</option>
        </select>
      </label>
      {value.mode === 'single' && input('from', '表示月')}
      {value.mode === 'range' && (
        <>
          {input('from', '開始月')}
          <span className="period-separator">〜</span>
          {input('through', '終了月')}
        </>
      )}
    </div>
  );
}
