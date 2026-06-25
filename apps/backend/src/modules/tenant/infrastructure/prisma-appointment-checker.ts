import type { PrismaClient } from '@prisma/client';
import type { IAppointmentChecker } from '../domain/appointment-checker';

const NON_TERMINAL_STATUSES = ['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED'] as const;

export class PrismaAppointmentChecker implements IAppointmentChecker {
  constructor(private readonly prisma: PrismaClient) {}

  async hasOpenAppointmentsForTenant(tenantId: string): Promise<boolean> {
    const count = await this.prisma.appointment.count({
      where: {
        tenant_id: tenantId,
        status: { in: [...NON_TERMINAL_STATUSES] },
      },
    });
    return count > 0;
  }

  async hasOpenAppointmentsForBranch(branchId: string): Promise<boolean> {
    const count = await this.prisma.appointment.count({
      where: {
        branch_id: branchId,
        status: { in: [...NON_TERMINAL_STATUSES] },
      },
    });
    return count > 0;
  }

  async hasOpenAppointmentsForProperty(propertyId: string): Promise<boolean> {
    const count = await this.prisma.appointment.count({
      where: {
        property_id: propertyId,
        status: { in: [...NON_TERMINAL_STATUSES] },
      },
    });
    return count > 0;
  }
}
