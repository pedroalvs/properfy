import type { PrismaClient } from '@prisma/client';
import type {
  AgencyForwardLookup,
  AgencyForwardRecipientReader,
} from '../domain/agency-forward';

/**
 * Resolves the branch contact that receives the mirror of a rental-tenant message
 * suppressed by the agency's `rentalTenantNotificationsEnabled` switch.
 *
 * `branches.contact_email` is the same address PROPERTY_MANAGER_ESCALATION and
 * INSPECTION_CANCELLED_AGENCY already use — the agency (tenant) row carries no email
 * address of its own.
 *
 * Returns a discriminated result rather than `null`, because the two failure causes are
 * operationally different and used to collapse into one misleading log line:
 * `APPOINTMENT_NOT_FOUND` means the row was deleted or the tenant scope excluded it (a
 * race, mostly benign), whereas `NO_BRANCH_EMAIL` means an agency is configured such that
 * neither the occupant nor the agency will ever hear about the inspection — the exact
 * failure this feature exists to prevent, and something someone has to go fix.
 *
 * Also returns `propertyAddress` and `appointmentNumber`: a mirror triggered by a
 * suppressed SMS inherits only the SMS payload, which carries no address, so the mirror's
 * subject would otherwise render as "Tenant notice not sent - " with a dangling separator.
 *
 * Tenant-scoped like every other repository read. `tenantId` is nullable only because
 * platform-scoped notifications carry no tenant; those are never RENTAL_TENANT-targeted,
 * so in practice this is always called with a concrete agency.
 */
export function createAgencyForwardRecipientReader(
  prisma: PrismaClient,
): AgencyForwardRecipientReader {
  return async (appointmentId: string, tenantId: string | null): Promise<AgencyForwardLookup> => {
    const where: Record<string, unknown> = { id: appointmentId, deleted_at: null };
    if (tenantId) where['tenant_id'] = tenantId;

    const row = await prisma.appointment.findFirst({
      where,
      select: {
        appointment_number: true,
        branch: { select: { name: true, contact_email: true } },
        property: { select: { street: true, suburb: true, state: true, postcode: true } },
        tenant: { select: { appointment_code_prefix: true } },
      },
    });

    if (!row) return { ok: false, reason: 'APPOINTMENT_NOT_FOUND' };

    const contactEmail = row.branch?.contact_email;
    if (!contactEmail) return { ok: false, reason: 'NO_BRANCH_EMAIL' };

    const prefix = row.tenant?.appointment_code_prefix ?? 'INS';
    const property = row.property;

    return {
      ok: true,
      recipient: {
        branchName: row.branch?.name ?? '',
        contactEmail,
        propertyAddress: property
          ? `${property.street}, ${property.suburb} ${property.state} ${property.postcode}`
          : '',
        appointmentCode: `${prefix}-${String(row.appointment_number).padStart(4, '0')}`,
      },
    };
  };
}
