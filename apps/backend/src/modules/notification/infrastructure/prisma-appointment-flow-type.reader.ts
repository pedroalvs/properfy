import type { PrismaClient } from '@prisma/client';

/**
 * Reads the flow type of the service type behind an appointment, scoped to the
 * notification's tenant.
 *
 * A function port rather than a repository dependency, mirroring
 * `createTenantSettingsReader`: the send path needs one scalar, and taking the
 * whole appointment repository would drag its construction order into the
 * notification wiring for no benefit.
 *
 * The tenant scope is not decorative. Without it a notification could have its
 * delivery decided by an appointment belonging to another agency — exactly the
 * "no business query without tenant scope" rule in backend CLAUDE.md §5.
 *
 * Returns `null` — meaning "unknown, keep notifying" — when the notification is
 * platform-scoped (`tenantId === null`, e.g. password reset), is not
 * appointment-scoped, or the appointment is not visible in that tenant. Every
 * absence fails open, because silencing an occupant who should have been
 * contacted is worse than sending one message too many.
 */
export function createAppointmentFlowTypeReader(prisma: PrismaClient) {
  return async (
    appointmentId: string | null | undefined,
    tenantId: string | null,
  ): Promise<string | null> => {
    if (!appointmentId || tenantId === null) return null;
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenant_id: tenantId },
      select: { service_type: { select: { flow_type: true } } },
    });
    return appointment?.service_type?.flow_type ?? null;
  };
}
