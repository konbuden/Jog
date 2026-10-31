import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Run } from '../../domain/models/run';
import { calendarWeeks } from '../../domain/analytics/calendar';
import { RunDetailsDialog } from '../run-details/RunDetailsDialog';
import { formatKm } from '../../components/format';
export function CalendarPanel({ runs, months }: { runs: readonly Run[]; months: string[] }) {
  const [chosen, setChosen] = useState(''),
    [selectedDate, setSelectedDate] = useState<string | null>(null),
    [popupOpen, setPopupOpen] = useState(false);
  const month = months.includes(chosen) ? chosen : (months.at(-1) ?? '');
  const index = months.indexOf(month);
  const weeks = useMemo(() => calendarWeeks(month, runs), [month, runs]);
  const selectedDay = weeks.flatMap((week) => week.dates).find((day) => day.date === selectedDate);
  const change = (value: string) => {
    setPopupOpen(false);
    setChosen(value);
    setSelectedDate(null);
  };
  return (
    <section className="panel calendar-panel" aria-labelledby="calendar-title">
      <div className="panel-heading">
        <div>
          <h2 id="calendar-title">
            <CalendarDays size={17} />
            ランニングカレンダー
          </h2>
          <p>日本時間・月曜始まり・日付を選んで当日の記録を見る</p>
        </div>
        <div className="calendar-nav">
          <button
            className="icon-button"
            aria-label="カレンダーの前月"
            disabled={index <= 0}
            onClick={() => change(months[index - 1]!)}
          >
            <ChevronLeft size={18} />
          </button>
          <select
            aria-label="カレンダー表示月"
            value={month}
            onChange={(e) => change(e.target.value)}
          >
            {months.map((value) => (
              <option key={value} value={value}>
                {value.slice(0, 4)}年{Number(value.slice(5))}月
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label="カレンダーの翌月"
            disabled={index < 0 || index >= months.length - 1}
            onClick={() => change(months[index + 1]!)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="calendar-content">
        {weeks.length ? (
          <table className="calendar-table">
            <caption className="sr-only">{month}の日別距離と週集計</caption>
            <thead>
              <tr>
                {['月', '火', '水', '木', '金', '土', '日'].map((day) => (
                  <th key={day} scope="col">
                    {day}
                  </th>
                ))}
                <th scope="col">週計</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.start}>
                  {week.dates.map((day) => {
                    const enabled = months.includes(day.date.slice(0, 7));
                    return (
                      <td key={day.date} className={day.inMonth ? '' : 'outside-month'}>
                        <button
                          disabled={!enabled}
                          className={`calendar-day${day.count ? ' has-runs' : ''}`}
                          aria-label={`${day.date} ${day.count}回 ${formatKm(day.distanceMeters)}km`}
                          aria-pressed={selectedDate === day.date}
                          onClick={(event) => {
                            event.currentTarget.focus({ preventScroll: true });
                            setSelectedDate(day.date);
                            setPopupOpen(day.count > 0);
                          }}
                        >
                          <span>{Number(day.date.split('-').at(-1))}</span>
                          <strong>{day.count ? `${formatKm(day.distanceMeters)}` : '—'}</strong>
                          <small>{day.count}回</small>
                        </button>
                      </td>
                    );
                  })}
                  <td className="calendar-weekly">
                    <strong>{formatKm(week.distanceMeters)}</strong>
                    <span>km</span>
                    <small>{week.count}回</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">対象月を選択してください。</p>
        )}
        <p className="calendar-note">
          距離はkm。週計は月曜〜日曜のうち、上で選んだ対象期間内の記録だけを合計します。期間の端では部分週になります。「—」は記録なしを表し、休養の判定ではありません。
        </p>
        {selectedDay && selectedDay.count === 0 && (
          <div className="calendar-selection" aria-live="polite">
            <div className="calendar-selection-heading">
              <h3>
                {selectedDay.date.replaceAll('-', '/')}の記録（{selectedDay.count}回）
              </h3>
              <button className="text-button" onClick={() => setSelectedDate(null)}>
                日付の選択を解除
              </button>
            </div>
            <p className="muted">この日のランニングはありません。</p>
          </div>
        )}
        {popupOpen && selectedDay && selectedDay.count > 0 && (
          <RunDetailsDialog
            key={selectedDay.date}
            date={selectedDay.date}
            runs={selectedDay.runs}
            onClose={() => setPopupOpen(false)}
          />
        )}
      </div>
    </section>
  );
}
