import type { PrismaClient } from '@prisma/client';
import type { IAuditEntityLabelResolver } from '../domain/audit-entity-label-resolver';

/**
 * W1 #409: Prisma implementation. Each entity type resolves via a single
 * `findMany({ where: { id: { in: ids } } })` — one query per type per page.
 * Unknown entity types (or ids with no matching row) simply do not appear in
 * the returned map, so the caller renders `null` for them.
 */
export class PrismaAuditEntityLabelResolver implements IAuditEntityLabelResolver {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveLabels(entityType: string, ids: string[]): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    if (ids.length === 0) return labels;

    switch (entityType) {
      case 'User': {
        const rows = await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        for (const r of rows) labels.set(r.id, r.name);
        break;
      }
      case 'Inspector': {
        const rows = await this.prisma.inspector.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        for (const r of rows) labels.set(r.id, r.name);
        break;
      }
      case 'Tenant': {
        const rows = await this.prisma.tenant.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        for (const r of rows) labels.set(r.id, r.name);
        break;
      }
      case 'Property': {
        const rows = await this.prisma.property.findMany({
          where: { id: { in: ids } },
          select: { id: true, property_code: true },
        });
        for (const r of rows) labels.set(r.id, r.property_code);
        break;
      }
      case 'Appointment': {
        const rows = await this.prisma.appointment.findMany({
          where: { id: { in: ids } },
          select: { id: true, appointment_number: true },
        });
        for (const r of rows) labels.set(r.id, `#${r.appointment_number}`);
        break;
      }
      default:
        // No resolvable label for this entity type.
        break;
    }

    return labels;
  }
}
