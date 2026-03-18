import { formatDateTime } from '@/lib/format-date';
import type { AuditLogEntry } from '../hooks/useAppointmentAuditLog';

interface AuditTimelineProps {
  entries: AuditLogEntry[];
}

export function AuditTimeline({ entries }: AuditTimelineProps) {
  if (entries.length === 0) return null;

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-[#E0E0E0]" />
      <ul className="flex flex-col gap-4">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <div className="absolute -left-4 top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-white" />
            <div className="ml-2">
              <p className="text-sm font-semibold text-text-primary">{entry.event}</p>
              <p className="text-xs text-text-secondary">
                by {entry.actorName} &middot; {formatDateTime(entry.createdAt)}
              </p>
              {entry.reason && (
                <p className="mt-1 text-xs text-text-secondary italic">
                  Reason: {entry.reason}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
