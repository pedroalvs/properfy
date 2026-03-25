import { useMemo, useState } from 'react';
import { AvailabilitySlotStatus } from '@properfy/shared';
import { formatDate, toLocalISODate } from '@/lib/format-date';
import type { AvailabilitySlot } from '../types';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 to 22:00
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  [AvailabilitySlotStatus.AVAILABLE]: { bg: 'bg-green-100', border: 'border-green-400' },
  [AvailabilitySlotStatus.BOOKED]: { bg: 'bg-blue-100', border: 'border-blue-400' },
  [AvailabilitySlotStatus.CANCELLED]: { bg: 'bg-gray-100', border: 'border-gray-400' },
};

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${monday.toLocaleDateString('en-AU', opts)} - ${sunday.toLocaleDateString('en-AU', opts)}`;
}

function formatDayHeader(monday: Date, dayIndex: number): string {
  const d = addDays(monday, dayIndex);
  return `${DAY_NAMES[dayIndex]} ${d.getDate()}`;
}

function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h! + (m ?? 0) / 60;
}

function dateToIso(date: Date): string {
  return toLocalISODate(date);
}

interface SlotCalendarViewProps {
  slots: AvailabilitySlot[];
  selectedInspectorId: string;
  onInspectorChange: (inspectorId: string) => void;
  weekStart: Date;
  onWeekChange: (newStart: Date) => void;
}

export function SlotCalendarView({
  slots,
  selectedInspectorId,
  onInspectorChange,
  weekStart,
  onWeekChange,
}: SlotCalendarViewProps) {
  const [tooltip, setTooltip] = useState<{ slot: AvailabilitySlot; x: number; y: number } | null>(null);

  const monday = useMemo(() => getMonday(weekStart), [weekStart]);

  const inspectors = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of slots) {
      if (!map.has(slot.inspectorId)) {
        map.set(slot.inspectorId, slot.inspectorName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [slots]);

  const filteredSlots = useMemo(() => {
    if (!selectedInspectorId) return slots;
    return slots.filter((s) => s.inspectorId === selectedInspectorId);
  }, [slots, selectedInspectorId]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, AvailabilitySlot[]>();
    for (let i = 0; i < 7; i++) {
      const key = dateToIso(addDays(monday, i));
      map.set(key, []);
    }
    for (const slot of filteredSlots) {
      const daySlots = map.get(slot.date);
      if (daySlots) {
        daySlots.push(slot);
      }
    }
    return map;
  }, [filteredSlots, monday]);

  const handlePrevWeek = () => onWeekChange(addDays(monday, -7));
  const handleNextWeek = () => onWeekChange(addDays(monday, 7));

  const handleSlotClick = (slot: AvailabilitySlot, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ slot, x: rect.left + rect.width / 2, y: rect.top });
  };

  const hourHeight = 48; // px per hour row

  return (
    <div className="relative" onClick={() => setTooltip(null)}>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={selectedInspectorId}
            onChange={(e) => onInspectorChange(e.target.value)}
            className="rounded border border-[#E0E0E0] bg-white px-3 py-1.5 text-sm text-text-primary"
            aria-label="Inspector filter"
          >
            <option value="">All Inspectors</option>
            {inspectors.map((insp) => (
              <option key={insp.id} value={insp.id}>
                {insp.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrevWeek}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
            aria-label="Previous week"
          >
            <i className="mdi mdi-chevron-left text-xl" />
          </button>
          <span className="min-w-[180px] text-center text-sm font-semibold text-text-primary" data-testid="week-label">
            {formatWeekLabel(monday)}
          </span>
          <button
            type="button"
            onClick={handleNextWeek}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
            aria-label="Next week"
          >
            <i className="mdi mdi-chevron-right text-xl" />
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-green-100 border border-green-400" />
            Available
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-blue-100 border border-blue-400" />
            Booked
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-gray-100 border border-gray-400" />
            Cancelled
          </span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto rounded border border-[#E0E0E0] bg-white">
        <div className="grid" style={{ gridTemplateColumns: '60px repeat(7, 1fr)', minWidth: '700px' }}>
          {/* Header row */}
          <div className="border-b border-r border-[#E0E0E0] bg-[#FAFAFA] px-2 py-2" />
          {DAY_NAMES.map((_, dayIndex) => (
            <div
              key={dayIndex}
              className="border-b border-r border-[#E0E0E0] bg-[#FAFAFA] px-2 py-2 text-center text-xs font-bold text-text-secondary last:border-r-0"
            >
              {formatDayHeader(monday, dayIndex)}
            </div>
          ))}

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              {/* Hour label */}
              <div
                className="border-b border-r border-[#F0F0F0] px-2 text-right text-xs text-text-muted"
                style={{ height: `${hourHeight}px`, lineHeight: `${hourHeight}px` }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
              {/* Day cells */}
              {DAY_NAMES.map((_, dayIndex) => {
                const dayKey = dateToIso(addDays(monday, dayIndex));
                const daySlots = slotsByDay.get(dayKey) ?? [];
                const slotsInHour = daySlots.filter((s) => {
                  const start = parseTime(s.startTime);
                  const end = parseTime(s.endTime);
                  return start <= hour && end > hour;
                });

                return (
                  <div
                    key={`${hour}-${dayIndex}`}
                    className="relative border-b border-r border-[#F0F0F0] last:border-r-0"
                    style={{ height: `${hourHeight}px` }}
                  >
                    {slotsInHour.map((slot) => {
                      const startHour = parseTime(slot.startTime);
                      const endHour = parseTime(slot.endTime);
                      const isFirstHour = Math.floor(startHour) === hour || (startHour > hour - 1 && startHour <= hour);
                      if (!isFirstHour) return null;

                      const durationHours = endHour - startHour;
                      const colors = STATUS_COLORS[slot.status] ?? STATUS_COLORS[AvailabilitySlotStatus.AVAILABLE]!;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          className={`absolute inset-x-1 z-10 cursor-pointer overflow-hidden rounded border text-left text-[10px] leading-tight ${colors.bg} ${colors.border}`}
                          style={{
                            top: `${(startHour - hour) * hourHeight}px`,
                            height: `${Math.min(durationHours, HOURS[HOURS.length - 1]! + 1 - startHour) * hourHeight - 2}px`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSlotClick(slot, e);
                          }}
                          aria-label={`${slot.inspectorName} ${slot.startTime}-${slot.endTime}`}
                          data-testid={`slot-block-${slot.id}`}
                        >
                          <div className="truncate px-1 pt-0.5 font-semibold">
                            {slot.inspectorName}
                          </div>
                          <div className="truncate px-1 text-text-secondary">
                            {slot.startTime} - {slot.endTime}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 rounded bg-white px-3 py-2 shadow-lg border border-[#E0E0E0]"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y - 8}px`,
            transform: 'translate(-50%, -100%)',
          }}
          data-testid="slot-tooltip"
        >
          <div className="text-sm font-semibold text-text-primary">{tooltip.slot.inspectorName}</div>
          <div className="text-xs text-text-secondary">
            {formatDate(tooltip.slot.date)} | {tooltip.slot.startTime} - {tooltip.slot.endTime}
          </div>
          <div className="text-xs text-text-secondary">
            Region: {tooltip.slot.region}
          </div>
          <div className="text-xs text-text-secondary">
            Capacity: {tooltip.slot.bookedCount}/{tooltip.slot.capacity} | Status: {tooltip.slot.status}
          </div>
        </div>
      )}
    </div>
  );
}
