import { createHash } from 'node:crypto';

/**
 * Dedicated UUIDv5 namespace for inspector-notice SMS notification ids. Frozen —
 * changing it would break idempotency of in-flight SMS. Mirrors the hand-rolled
 * RFC-4122 v5 scheme in `notification/domain/agency-forward.ts`.
 */
const INSPECTOR_NOTICE_SMS_UUID_NAMESPACE = '6f9b1d2e-0c47-5a8b-bf3d-2a1c6e4d9f70';

/**
 * Deterministic notification id for the fallback SMS of one (notice, inspector) pair.
 * Passing it to `CreateNotificationUseCase` makes re-delivery a `saveIfAbsent` no-op,
 * so a retried delivery never creates a second SMS nor re-consumes the daily cap.
 */
export function getInspectorNoticeSmsNotificationId(
  noticeId: string,
  inspectorId: string,
): string {
  const namespace = Buffer.from(INSPECTOR_NOTICE_SMS_UUID_NAMESPACE.replaceAll('-', ''), 'hex');
  const bytes = createHash('sha1')
    .update(namespace)
    .update(`${noticeId}:${inspectorId}`, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
