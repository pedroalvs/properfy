import type { PrismaClient } from '@prisma/client';

/**
 * Reads the flow type of the service type behind an appointment.
 *
 * A function port rather than a repository dependency, mirroring
 * `createTenantSettingsReader`: the send path needs one scalar, and taking the
 * whole appointment repository would drag its construction order into the
 * notification wiring for no benefit.
 *
 * Returns `null` when the notification is not appointment-scoped, or the
 * appointment has since been deleted — the caller then treats the flow as
 * unknown and keeps notifying, which is the fail-open direction.
 */
export function createAppointmentFlowTypeReader(prisma: PrismaClient) {
  return async (appointmentId: string | null | undefined): Promise<string | null> => {
    if (!appointmentId) return null;
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { service_type: { select: { flow_type: true } } },
    });
    return appointment?.service_type?.flow_type ?? null;
  };
}
