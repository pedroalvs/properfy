import { formatDateTime } from '@/lib/format-date';
import type { AuditLogEntry } from '../hooks/useAppointmentAuditLog';

interface AuditTimelineProps {
  entries: AuditLogEntry[];
}

const ACTION_LABELS: Record<string, string> = {
  'appointment.status_transition': 'Status Changed',
  'appointment.created': 'Appointment Created',
  'appointment.updated': 'Appointment Updated',
  'appointment.done_pending_crosscheck': 'Done — Pending Cross-check',
  'appointment.done_rejected': 'Done Reversed to Rejected',
  'appointment.crosscheck_done': 'Operator Cross-check Confirmed',
  'appointment.deleted': 'Appointment Deleted',
  'tenant_portal.appointment_confirmed': 'Tenant Confirmed',
  'tenant_portal.unavailability_reported': 'Tenant Reported Unavailable',
  'tenant_portal.appointment_rescheduled': 'Tenant Requested Reschedule',
  'tenant_portal.contact_updated': 'Tenant Contact Updated',
  'inspection.started': 'Inspection Started',
  'inspection.finished': 'Inspection Finished',
};

const ACTION_STYLES: Record<string, { icon: string; color: string }> = {
  'appointment.status_transition': { icon: 'mdi-swap-horizontal', color: 'border-primary' },
  'appointment.created': { icon: 'mdi-plus-circle', color: 'border-success' },
  'appointment.updated': { icon: 'mdi-pencil', color: 'border-info' },
  'appointment.done_pending_crosscheck': { icon: 'mdi-alert-circle', color: 'border-warning' },
  'appointment.done_rejected': { icon: 'mdi-close-circle', color: 'border-error' },
  'appointment.crosscheck_done': { icon: 'mdi-check-decagram', color: 'border-success' },
  'appointment.deleted': { icon: 'mdi-delete', color: 'border-error' },
  'tenant_portal.appointment_confirmed': { icon: 'mdi-check', color: 'border-success' },
  'tenant_portal.unavailability_reported': { icon: 'mdi-account-cancel', color: 'border-warning' },
  'tenant_portal.appointment_rescheduled': { icon: 'mdi-calendar-sync', color: 'border-info' },
  'tenant_portal.contact_updated': { icon: 'mdi-account-edit', color: 'border-info' },
  'inspection.started': { icon: 'mdi-play-circle', color: 'border-success' },
  'inspection.finished': { icon: 'mdi-flag-checkered', color: 'border-success' },
};

const DEFAULT_STYLE = { icon: 'mdi-circle-small', color: 'border-primary' };

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatActor(entry: AuditLogEntry): string {
  if (entry.actorName) return entry.actorName;
  if (entry.actorType === 'SYSTEM') return 'System';
  if (entry.actorType === 'ANONYMOUS') return 'Anonymous';
  return entry.actorId ? `User (${entry.actorId.slice(0, 8)}...)` : entry.actorType;
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
      return `${key}: ${beforeValue} \u2192 ${afterValue}`;
    });

  return changes.length > 0 ? changes.join(' | ') : null;
}

function getMetadataBadges(metadataJson: unknown): string[] {
  if (!metadataJson || typeof metadataJson !== 'object' || Array.isArray(metadataJson)) return [];
  const meta = metadataJson as Record<string, unknown>;
  const badges: string[] = [];
  if (meta['pendingOperatorCrossCheck']) badges.push('Pending Cross-check');
  if (meta['requiresFinancialReview']) badges.push('Requires Financial Review');
  return badges;
}

export function AuditTimeline({ entries }: AuditTimelineProps) {
  if (entries.length === 0) return null;

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-[#E0E0E0]" />
      <ul className="flex flex-col gap-4">
        {entries.map((entry) => {
          const style = ACTION_STYLES[entry.action] ?? DEFAULT_STYLE;
          const changeSummary = summarizeChanges(entry.beforeJson, entry.afterJson);
          const badges = getMetadataBadges(entry.metadataJson);

          return (
            <li key={entry.id} className="relative">
              <div className={`absolute -left-4 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white ${style.color}`}>
                <i className={`mdi ${style.icon} text-[10px]`} aria-hidden="true" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-semibold text-text-primary">{formatAction(entry.action)}</p>
                <p className="text-xs text-text-secondary">
                  by {formatActor(entry)} &middot; {formatDateTime(entry.createdAt)}
                </p>
                {entry.reason && (
                  <p className="mt-1 text-xs text-text-secondary italic">
                    Reason: {entry.reason}
                  </p>
                )}
                {changeSummary && (
                  <p className="mt-1 text-xs text-text-secondary">
                    Changed: {changeSummary}
                  </p>
                )}
                {badges.length > 0 && (
                  <div className="mt-1 flex gap-1.5">
                    {badges.map((badge) => (
                      <span
                        key={badge}
                        className="inline-block rounded bg-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-warning"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
