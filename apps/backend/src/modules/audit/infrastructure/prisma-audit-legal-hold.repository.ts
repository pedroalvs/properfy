import type { PrismaClient } from '@prisma/client';
import { AuditLegalHoldEntity } from '../domain/audit-legal-hold.entity';
import type { IAuditLegalHoldRepository } from '../domain/audit-legal-hold.repository';

function mapToEntity(row: any): AuditLegalHoldEntity {
  return new AuditLegalHoldEntity({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    tenantId: row.tenant_id,
    reason: row.reason,
    placedByUserId: row.placed_by_user_id,
    placedAt: row.placed_at,
    releasedByUserId: row.released_by_user_id ?? null,
    releasedAt: row.released_at ?? null,
    isActive: row.is_active,
  });
}

export class PrismaAuditLegalHoldRepository implements IAuditLegalHoldRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllActive(): Promise<AuditLegalHoldEntity[]> {
    const rows = await this.prisma.auditLegalHold.findMany({ where: { is_active: true } });
    return rows.map(mapToEntity);
  }

  async findById(id: string): Promise<AuditLegalHoldEntity | null> {
    const row = await this.prisma.auditLegalHold.findUnique({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async findByEntity(entityType: string, entityId: string): Promise<AuditLegalHoldEntity[]> {
    const rows = await this.prisma.auditLegalHold.findMany({
      where: { entity_type: entityType, entity_id: entityId },
    });
    return rows.map(mapToEntity);
  }

  async save(entity: AuditLegalHoldEntity): Promise<void> {
    await this.prisma.auditLegalHold.create({
      data: {
        id: entity.id,
        entity_type: entity.entityType,
        entity_id: entity.entityId,
        tenant_id: entity.tenantId,
        reason: entity.reason,
        placed_by_user_id: entity.placedByUserId,
        is_active: entity.isActive,
      },
    });
  }

  async update(entity: AuditLegalHoldEntity): Promise<void> {
    await this.prisma.auditLegalHold.update({
      where: { id: entity.id },
      data: {
        released_by_user_id: entity.releasedByUserId,
        released_at: entity.releasedAt,
        is_active: entity.isActive,
      },
    });
  }
}
