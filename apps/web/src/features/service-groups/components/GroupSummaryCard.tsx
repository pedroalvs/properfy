import { PriorityMode } from '@properfy/shared';
import { PRIORITY_MODE_MAP } from '@/lib/status-colors';

interface GroupSummaryCardProps {
  appointmentCount: number;
  serviceType: string;
  scheduledDate: string;
  timeWindow: string;
  priorityMode: string;
}

export function GroupSummaryCard({
  appointmentCount,
  serviceType,
  scheduledDate,
  timeWindow,
  priorityMode,
}: GroupSummaryCardProps) {
  const priorityStyle = PRIORITY_MODE_MAP[priorityMode as PriorityMode] ?? PRIORITY_MODE_MAP[PriorityMode.STANDARD];

  return (
    <div className="rounded border border-border-subtle bg-app-bg p-4">
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-secondary">
        Group Summary
      </h4>
      <div className="grid grid-cols-2 gap-y-2 gap-x-6">
        <div className="text-sm text-text-secondary">Appointments</div>
        <div className="text-sm font-semibold text-text-primary">{appointmentCount}</div>

        <div className="text-sm text-text-secondary">Service Type</div>
        <div className="text-sm font-semibold text-text-primary">{serviceType || '—'}</div>

        <div className="text-sm text-text-secondary">Scheduled Date</div>
        <div className="text-sm font-semibold text-text-primary">{scheduledDate || '—'}</div>

        <div className="text-sm text-text-secondary">Time Window</div>
        <div className="text-sm font-semibold text-text-primary">{timeWindow || '—'}</div>

        <div className="text-sm text-text-secondary">Priority</div>
        <div>
          <span
            className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
            style={{ backgroundColor: priorityStyle.bg, color: priorityStyle.text }}
          >
            {priorityStyle.label}
          </span>
        </div>
      </div>
    </div>
  );
}
