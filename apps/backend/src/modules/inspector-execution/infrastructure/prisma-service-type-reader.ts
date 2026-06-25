import type { PrismaClient } from '@prisma/client';
import type { IServiceTypeReader, ServiceTypeInfo } from '../domain/service-type-reader';

export class PrismaServiceTypeReader implements IServiceTypeReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ServiceTypeInfo | null> {
    const row = await this.prisma.serviceType.findUnique({ where: { id } });
    if (!row) return null;
    return { id: row.id, code: row.code, name: row.name, flowType: row.flow_type };
  }

  async findByIds(ids: string[]): Promise<ServiceTypeInfo[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.serviceType.findMany({ where: { id: { in: ids } } });
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, flowType: r.flow_type }));
  }
}
