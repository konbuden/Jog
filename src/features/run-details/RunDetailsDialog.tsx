import { useEffect, useRef, useState } from 'react';
import type { Run } from '../../domain/models/run';
import { formatKm, formatTime } from '../../components/format';
import { RunDetailsPanel } from './RunDetailsPanel';

export function RunDetailsDialog({
  runs,
  date,
  onClose,
}: {
  runs: readonly Run[];
  date: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState(runs[0]!.id);
  const run = runs.find((item) => item.id === chosen) ?? runs[0]!;
  useEffect(() => {
    const previous = document.activeElement,
      x = window.scrollX,
      y = window.scrollY;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.current?.showModal();
    dialog.current?.focus({ preventScroll: true });
    return () => {
      dialog.current?.close();
      document.documentElement.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
      window.scrollTo(x, y);
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="run-details-dialog"
      tabIndex={-1}
      aria-label={`${date.replaceAll('-', '/')}の記録（${runs.length}回）`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-run-picker">
        <h2>
          {date.replaceAll('-', '/')}の記録（{runs.length}回）
        </h2>
        {runs.length > 1 && (
          <label>
            当日のランニング
            <select value={run.id} onChange={(event) => setChosen(event.target.value)}>
              {runs.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatTime(item.startTime)}・{formatKm(item.distanceMeters)} km
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <RunDetailsPanel key={run.id} run={run} onClose={onClose} manageFocus={false} />
      <div className="dialog-actions">
        <button className="primary-button" onClick={onClose}>
          閉じてカレンダーに戻る
        </button>
      </div>
    </dialog>
  );
}
