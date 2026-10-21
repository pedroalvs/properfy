import type { PrismaClient } from '@prisma/client';
import { NON_TERMINAL_APPOINTMENT_STATUSES } from '@properfy/shared';
import type { IAppointmentChecker } from '../domain/appointment-checker';

export class PrismaAppointmentChecker implements IAppointmentChecker {
  constructor(private readonly prisma: PrismaClient) {}

  async hasOpenAppointmentsForTenant(tenantId: string): Promise<boolean> {
    const count = await this.prisma.appointment.count({
      where: {
        tenant_id: tenantId,
        status: { in: [...NON_TERMINAL_APPOINTMENT_STATUSES] },
      },
    });
    return count > 0;
  }

  async hasOpenAppointmentsForBranch(tenantId: string, branchId: string): Promise<boolean> {
    const count = await this.prisma.appointment.count({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        status: { in: [...NON_TERMINAL_APPOINTMENT_STATUSES] },
      },
    });
    return count > 0;
  }

  async hasOpenAppointmentsForProperty(tenantId: string, propertyId: string): Promise<boolean> {
    const count = await this.prisma.appointment.count({
      where: {
        tenant_id: tenantId,
        property_id: propertyId,
        status: { in: [...NON_TERMINAL_APPOINTMENT_STATUSES] },
      },
    });
    return count > 0;
  }
}
