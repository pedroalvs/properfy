import type { PrismaClient } from '@prisma/client';
import type { IGroupAppointmentReader } from '../domain/group-appointment.reader';

export class PrismaGroupAppointmentReader implements IGroupAppointmentReader {
  constructor(private readonly prisma: PrismaClient) {}

  async loadIdsByGroup(groupId: string): Promise<string[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { service_group_id: groupId, deleted_at: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
