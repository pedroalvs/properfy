import { useMemo, useState, useEffect } from 'react';
import { cn } from '@properfy/frontend-standards';

export interface TimePanelProps {
  /** Canonical 24-hour `HH:mm`, or `''`. */
  selected: string;
  /** Called when a time is selected: emitted as canonical 24-hour `HH:mm`. */
  onSelect: (value: string) => void;
  /** Canonical 24-hour `HH:mm` lower bound. */
  min?: string;
  /** Canonical 24-hour `HH:mm` upper bound. */
  max?: string;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = ['00', '15', '30', '45'];

function parseHhmm(hhmm: string): { hour: number; minute: string; meridiem: 'am' | 'pm' } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h24 = Number(match[1]);
  const m = match[2]!;
  const meridiem = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour: h12, minute: m, meridiem };
}

function toCanonical(hour: number, minute: string, meridiem: 'am' | 'pm'): string {
  let h24 = hour % 12;
  if (meridiem === 'pm') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

export function TimePanel({ selected, onSelect, min, max }: TimePanelProps) {
  const initial = useMemo(() => {
    if (selected) {
      const p = parseHhmm(selected);
      if (p) return p;
    }
    if (min) {
      const p = parseHhmm(min);
      if (p) return p;
    }
    return { hour: 9, minute: '00', meridiem: 'am' as const };
  }, [selected, min]);

  const [hour, setHour] = useState<number>(initial.hour);
  const [minute, setMinute] = useState<string>(initial.minute);
  const [meridiem, setMeridiem] = useState<'am' | 'pm'>(initial.meridiem);

  useEffect(() => {
    if (selected) {
      const p = parseHhmm(selected);
      if (p) {
        setHour(p.hour);
        setMinute(p.minute);
        setMeridiem(p.meridiem);
      }
    }
  }, [selected]);

  const isMinuteDisabled = (h: number, m: string, merid: 'am' | 'pm') => {
    const canonical = toCanonical(h, m, merid);
    if (min != null && canonical < min) return true;
    if (max != null && canonical > max) return true;
    return false;
  };

  const isHourDisabled = (h: number, merid: 'am' | 'pm') => {
    return MINUTES.every((m) => isMinuteDisabled(h, m, merid));
  };

  const handleHourClick = (h: number) => {
    setHour(h);
  };

  const handleMinuteClick = (m: string) => {
    setMinute(m);
    onSelect(toCanonical(hour, m, meridiem));
  };

  const handleConfirm = () => {
    onSelect(toCanonical(hour, minute, meridiem));
  };

  const handleNow = () => {
    const now = new Date();
    const nowH = now.getHours();
    const merid = nowH >= 12 ? 'pm' : 'am';
    const h12 = nowH % 12 === 0 ? 12 : nowH % 12;
    const rawM = now.getMinutes();
    const m = rawM < 15 ? '00' : rawM < 30 ? '15' : rawM < 45 ? '30' : '45';
    setHour(h12);
    setMinute(m);
    setMeridiem(merid);
    onSelect(toCanonical(h12, m, merid));
  };

  return (
    <div className="p-3">
      {/* Header with selected time preview and AM/PM toggle */}
      <div className="mb-3 flex items-center justify-between border-b border-black/5 pb-2">
        <div>
          <span className="block text-[11px] font-semibold text-text-muted">Selected</span>
          <span className="text-sm font-bold text-secondary">
            {hour}:{minute} {meridiem.toUpperCase()}
          </span>
        </div>
        <div className="flex rounded bg-gray-100 p-0.5" role="group" aria-label="Meridiem">
          <button
            type="button"
            onClick={() => setMeridiem('am')}
            aria-pressed={meridiem === 'am'}
            aria-label="Select AM"
            className={cn(
              'rounded px-2.5 py-1 text-xs font-bold uppercase transition-colors',
              meridiem === 'am'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            AM
          </button>
          <button
            type="button"
            onClick={() => setMeridiem('pm')}
            aria-pressed={meridiem === 'pm'}
            aria-label="Select PM"
            className={cn(
              'rounded px-2.5 py-1 text-xs font-bold uppercase transition-colors',
              meridiem === 'pm'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            PM
          </button>
        </div>
      </div>

      {/* Hours Grid (1..12) */}
      <div className="mb-2.5">
        <span className="mb-1 block text-[11px] font-semibold text-text-muted">Hour</span>
        <div className="grid grid-cols-6 gap-1 text-center" role="group" aria-label="Hours">
          {HOURS.map((h) => {
            const isSelected = hour === h;
            const disabled = isHourDisabled(h, meridiem);
            return (
              <button
                key={h}
                type="button"
                disabled={disabled}
                onClick={() => handleHourClick(h)}
                aria-pressed={isSelected}
                aria-label={`${h} ${meridiem.toUpperCase()}`}
                className={cn(
                  'flex h-8 w-full items-center justify-center rounded text-sm transition-colors',
                  isSelected
                    ? 'bg-primary font-bold text-white'
                    : disabled
                      ? 'cursor-not-allowed text-text-disabled'
                      : 'text-text-primary hover:bg-primary/10',
                )}
              >
                {h}
              </button>
            );
          })}
        </div>
      </div>

      {/* Minutes Grid (:00, :15, :30, :45) */}
      <div className="mb-3">
        <span className="mb-1 block text-[11px] font-semibold text-text-muted">Minute</span>
        <div className="grid grid-cols-4 gap-1 text-center" role="group" aria-label="Minutes">
          {MINUTES.map((m) => {
            const isSelected = minute === m;
            const disabled = isMinuteDisabled(hour, m, meridiem);
            return (
              <button
                key={m}
                type="button"
                disabled={disabled}
                onClick={() => handleMinuteClick(m)}
                aria-pressed={isSelected}
                aria-label={`:${m}`}
                className={cn(
                  'flex h-8 w-full items-center justify-center rounded text-sm transition-colors',
                  isSelected
                    ? 'bg-primary font-bold text-white'
                    : disabled
                      ? 'cursor-not-allowed text-text-disabled'
                      : 'text-text-primary hover:bg-primary/10',
                )}
              >
                :{m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-black/5 pt-2">
        <button
          type="button"
          onClick={handleNow}
          className="text-xs font-medium text-text-secondary hover:text-primary transition-colors"
        >
          Now
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded bg-primary px-3 py-1 text-xs font-bold text-white hover:bg-primary/90 transition-colors"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
