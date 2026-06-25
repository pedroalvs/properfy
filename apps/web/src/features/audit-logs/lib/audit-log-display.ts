import type { AuditLog } from '../types';

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatAuditAction(action: string): string {
  return action
    .replace(/[._]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatAuditActor(actorType: string, actorId: string | null, actorName?: string | null): string {
  if (actorName) return actorName;
  const label = toTitleCase(actorType);
  return actorId ? `${label} (${actorId})` : label;
}

export function formatAuditTenant(tenantId: string | null, tenantName?: string | null): string {
  if (tenantName) return tenantName;
  return tenantId ?? 'Global';
}

export function summarizeAuditChanges(log: Pick<AuditLog, 'beforeJson' | 'afterJson'>): string {
  if (!isPlainRecord(log.beforeJson) || !isPlainRecord(log.afterJson)) {
    return '—';
  }

  const beforeRecord = log.beforeJson;
  const afterRecord = log.afterJson;
  const changedKeys = Array.from(new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]))
    .filter((key) => JSON.stringify(beforeRecord[key]) !== JSON.stringify(afterRecord[key]));

  if (changedKeys.length === 0) {
    return '—';
  }

  const summary = changedKeys.slice(0, 3).join(', ');
  return changedKeys.length > 3 ? `${summary} +${changedKeys.length - 3}` : summary;
}
