import type { PrismaClient } from '@prisma/client';
import type { PreservationRuleType as PrismaPreservationRuleType } from '@prisma/client';
import type { PreservationRuleType } from '@properfy/shared';
import { AuditPreservationRuleEntity } from '../domain/audit-preservation-rule.entity';
import type { IAuditPreservationRuleRepository } from '../domain/audit-preservation-rule.repository';

function mapToEntity(row: any): AuditPreservationRuleEntity {
  return new AuditPreservationRuleEntity({
    id: row.id,
    name: row.name,
    ruleType: row.rule_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    tenantId: row.tenant_id,
    isActive: row.is_active,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaAuditPreservationRuleRepository implements IAuditPreservationRuleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllActive(): Promise<AuditPreservationRuleEntity[]> {
    const rows = await this.prisma.auditPreservationRule.findMany({ where: { is_active: true } });
    return rows.map(mapToEntity);
  }

  async findById(id: string): Promise<AuditPreservationRuleEntity | null> {
    const row = await this.prisma.auditPreservationRule.findUnique({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async findByType(ruleType: PreservationRuleType): Promise<AuditPreservationRuleEntity[]> {
    const rows = await this.prisma.auditPreservationRule.findMany({
      where: { rule_type: ruleType as PrismaPreservationRuleType, is_active: true },
    });
    return rows.map(mapToEntity);
  }

  async save(entity: AuditPreservationRuleEntity): Promise<void> {
    await this.prisma.auditPreservationRule.create({
      data: {
        id: entity.id,
        name: entity.name,
        rule_type: entity.ruleType as PrismaPreservationRuleType,
        entity_type: entity.entityType,
        entity_id: entity.entityId,
        tenant_id: entity.tenantId,
        is_active: entity.isActive,
        created_by_user_id: entity.createdByUserId,
      },
    });
  }

  async update(entity: AuditPreservationRuleEntity): Promise<void> {
    await this.prisma.auditPreservationRule.update({
      where: { id: entity.id },
      data: {
        name: entity.name,
        is_active: entity.isActive,
      },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.auditPreservationRule.update({
      where: { id },
      data: { is_active: false },
    });
  }
}
