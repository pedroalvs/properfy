import { formatDateTime } from '@/lib/format-date';
import type { AuditLogEntry } from '../hooks/useAppointmentAuditLog';

interface AuditTimelineProps {
  entries: AuditLogEntry[];
}

export function AuditTimeline({ entries }: AuditTimelineProps) {
  if (entries.length === 0) return null;

  function formatAction(action: string): string {
    return action
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatActor(entry: AuditLogEntry): string {
    return entry.actorId ? `${entry.actorType} (${entry.actorId})` : entry.actorType;
  }

  function summarizeChanges(beforeJson: unknown, afterJson: unknown): string | null {
    if (
      !beforeJson ||
      !afterJson ||
      typeof beforeJson !== 'object' ||
      typeof afterJson !== 'object' ||
      Array.isArray(beforeJson) ||
      Array.isArray(afterJson)
    ) {
      return null;
    }

    const beforeRecord = beforeJson as Record<string, unknown>;
    const afterRecord = afterJson as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]));

    const changes = keys
      .filter((key) => JSON.stringify(beforeRecord[key]) !== JSON.stringify(afterRecord[key]))
      .slice(0, 3)
      .map((key) => {
        const beforeValue = beforeRecord[key] == null ? '—' : String(beforeRecord[key]);
        const afterValue = afterRecord[key] == null ? '—' : String(afterRecord[key]);
        return `${key}: ${beforeValue} -> ${afterValue}`;
      });

    return changes.length > 0 ? changes.join(' | ') : null;
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-[#E0E0E0]" />
      <ul className="flex flex-col gap-4">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <div className="absolute -left-4 top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-white" />
            <div className="ml-2">
              <p className="text-sm font-semibold text-text-primary">{formatAction(entry.action)}</p>
              <p className="text-xs text-text-secondary">
                by {formatActor(entry)} &middot; {formatDateTime(entry.createdAt)}
              </p>
              {entry.reason && (
                <p className="mt-1 text-xs text-text-secondary italic">
                  Reason: {entry.reason}
                </p>
              )}
              {summarizeChanges(entry.beforeJson, entry.afterJson) && (
                <p className="mt-1 text-xs text-text-secondary">
                  Changed: {summarizeChanges(entry.beforeJson, entry.afterJson)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
