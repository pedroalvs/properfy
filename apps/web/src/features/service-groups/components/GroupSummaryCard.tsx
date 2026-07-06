interface GroupSummaryCardProps {
  appointmentCount: number;
  serviceType: string;
  scheduledDate: string;
  timeWindow: string;
}

export function GroupSummaryCard({
  appointmentCount,
  serviceType,
  scheduledDate,
  timeWindow,
}: GroupSummaryCardProps) {
  return (
    <div className="rounded border border-border-subtle bg-app-bg p-4">
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-secondary">
        Group Summary
      </h4>
      <div className="grid grid-cols-1 gap-y-2 gap-x-6 sm:grid-cols-2">
        <div className="text-sm text-text-secondary">Appointments</div>
        <div className="text-sm font-semibold text-text-primary">{appointmentCount}</div>

        <div className="text-sm text-text-secondary">Service Type</div>
        <div className="text-sm font-semibold text-text-primary">{serviceType || '—'}</div>

        <div className="text-sm text-text-secondary">Scheduled Date</div>
        <div className="text-sm font-semibold text-text-primary">{scheduledDate || '—'}</div>

        <div className="text-sm text-text-secondary">Time Window</div>
        <div className="text-sm font-semibold text-text-primary">{timeWindow || '—'}</div>
      </div>
    </div>
  );
}
