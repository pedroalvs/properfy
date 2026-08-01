import { createHash } from 'node:crypto';

/** Where a suppressed rental-tenant notification is mirrored. */
export interface AgencyForwardRecipient {
  branchName: string;
  contactEmail: string;
  propertyAddress: string;
  appointmentCode: string;
}

export type AgencyForwardLookup =
  | { ok: true; recipient: AgencyForwardRecipient }
  | { ok: false; reason: 'APPOINTMENT_NOT_FOUND' | 'NO_BRANCH_EMAIL' };

/** Tenant-scoped port used to resolve the agency recipient for a suppressed notification. */
export type AgencyForwardRecipientReader = (
  appointmentId: string,
  tenantId: string | null,
) => Promise<AgencyForwardLookup>;

/**
 * Immutable UUID v5 namespace reserved for agency-forward notifications.
 * Changing it would change IDs for existing source notifications and break replay idempotency.
 */
const AGENCY_FORWARD_UUID_NAMESPACE = 'c2d64983-2c06-5c6c-9eef-7e1bca32a29f';

export function getAgencyForwardNotificationId(sourceNotificationId: string): string {
  const namespace = Buffer.from(AGENCY_FORWARD_UUID_NAMESPACE.replaceAll('-', ''), 'hex');
  const bytes = createHash('sha1')
    .update(namespace)
    .update(sourceNotificationId, 'utf8')
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
