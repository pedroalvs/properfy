import type { ScheduleStatus } from '../types';

const STYLES: Record<ScheduleStatus, { color: string; label: string }> = {
  ACTIVE: { color: 'bg-[#C8E6C9] text-[#1B5E20]', label: 'Active' },
  PAUSED: { color: 'bg-[#FFE0B2] text-[#E65100]', label: 'Paused' },
};

/**
 * Feature 019: visual chip for a schedule's lifecycle status.
 */
export function ScheduleStatusChip({ status }: { status: ScheduleStatus }) {
  const style = STYLES[status];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${style.color}`}>
      {style.label}
    </span>
  );
}
