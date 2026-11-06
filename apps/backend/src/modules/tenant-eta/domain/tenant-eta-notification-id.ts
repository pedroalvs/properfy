import { createHash } from 'node:crypto';
import type { NotificationChannel } from '@properfy/shared';
import type { TenantEtaKind } from './tenant-eta.constants';

/**
 * Immutable UUID v5 namespace reserved for tenant arrival-time notifications
 * (F06). FIXED FOR ALL TIME — changing it would change the deterministic IDs of
 * existing notices and break the "one per stop per day per channel" dedupe that
 * the TASK-F06-2 triggers rely on.
 */
const TENANT_ETA_UUID_NAMESPACE = '4f0b7d2e-9c3a-5e61-8b4d-27a1c6e95f03';

export interface TenantEtaNotificationIdInput {
  kind: TenantEtaKind;
  appointmentId: string;
  /** civil date in the agency timezone (YYYY-MM-DD) */
  scheduledDate: string;
  channel: NotificationChannel;
}

/**
 * Deterministic notification id for a tenant arrival-time notice. Stable across
 * calls and distinct per (kind, appointment, date, channel), so re-running a
 * trigger inserts nothing (dedupe via `saveIfAbsent`).
 */
export function getTenantEtaNotificationId(input: TenantEtaNotificationIdInput): string {
  const namespace = Buffer.from(TENANT_ETA_UUID_NAMESPACE.replaceAll('-', ''), 'hex');
  const name = `${input.kind}:${input.appointmentId}:${input.scheduledDate}:${input.channel}`;
  const bytes = createHash('sha1').update(namespace).update(name, 'utf8').digest().subarray(0, 16);

  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
