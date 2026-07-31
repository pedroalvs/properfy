import type { PrismaClient } from '@prisma/client';
import type { AgencyForwardRecipient } from '../application/use-cases/send-notification.use-case';

/**
 * Resolves the branch contact that receives the mirror of a rental-tenant message
 * suppressed by the agency's `rentalTenantNotificationsEnabled` switch.
 *
 * `branches.contact_email` is the same address PROPERTY_MANAGER_ESCALATION and
 * INSPECTION_CANCELLED_AGENCY already use — the agency (tenant) row carries no email
 * address of its own.
 *
 * Returns null when the appointment is gone or its branch has no contact email; the
 * caller logs and counts that rather than dropping it silently, because the column is
 * nullable and optional at creation, so an unreachable agency is a steady-state
 * population and not an edge case.
 *
 * Tenant-scoped like every other repository read. `tenantId` is nullable only because
 * platform-scoped notifications carry no tenant; those are never RENTAL_TENANT-targeted,
 * so in practice this is always called with a concrete agency.
 */
export function createAgencyForwardRecipientReader(prisma: PrismaClient) {
  return async (
    appointmentId: string,
    tenantId: string | null,
  ): Promise<AgencyForwardRecipient | null> => {
    const where: Record<string, unknown> = { id: appointmentId, deleted_at: null };
    if (tenantId) where['tenant_id'] = tenantId;

    const row = await prisma.appointment.findFirst({
      where,
      select: { branch: { select: { name: true, contact_email: true } } },
    });

    const contactEmail = row?.branch?.contact_email;
    if (!contactEmail) return null;

    return { branchName: row?.branch?.name ?? '', contactEmail };
  };
}
