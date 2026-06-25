import type { PrismaClient } from '@prisma/client';
import type {
  IInspectorAppointmentChecker,
  OpenAppointmentCounts,
} from '../domain/inspector-appointment-checker';

const NON_TERMINAL_STATUSES = ['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED'] as const;

export class PrismaInspectorAppointmentChecker implements IInspectorAppointmentChecker {
  constructor(private readonly prisma: PrismaClient) {}

  async countOpenAppointmentsForInspector(inspectorId: string): Promise<OpenAppointmentCounts> {
    const rows = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: {
        inspector_id: inspectorId,
        status: { in: [...NON_TERMINAL_STATUSES] },
      },
      _count: { status: true },
    });

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byStatus[row.status] = row._count.status;
      total += row._count.status;
    }

    return { total, byStatus };
  }
}
