import type { PrismaClient } from '@prisma/client';
import type { AuditRetentionCategory as PrismaAuditRetentionCategory } from '@prisma/client';
import type { AuditRetentionCategory } from '@properfy/shared';
import { AuditRetentionCategoryConfigEntity } from '../domain/audit-retention-category.entity';
import type { IAuditRetentionCategoryRepository } from '../domain/audit-retention-category.repository';

function mapToEntity(row: any): AuditRetentionCategoryConfigEntity {
  return new AuditRetentionCategoryConfigEntity({
    id: row.id,
    name: row.name,
    retentionYears: row.retention_years,
    hardDeleteEnabled: row.hard_delete_enabled,
    description: row.description ?? null,
    actionPatterns: Array.isArray(row.action_patterns_json) ? (row.action_patterns_json as string[]) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaAuditRetentionCategoryRepository implements IAuditRetentionCategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<AuditRetentionCategoryConfigEntity[]> {
    const rows = await this.prisma.auditRetentionCategoryConfig.findMany();
    return rows.map(mapToEntity);
  }

  async findByName(name: AuditRetentionCategory): Promise<AuditRetentionCategoryConfigEntity | null> {
    const row = await this.prisma.auditRetentionCategoryConfig.findUnique({
      where: { name: name as PrismaAuditRetentionCategory },
    });
    return row ? mapToEntity(row) : null;
  }

  async save(entity: AuditRetentionCategoryConfigEntity): Promise<void> {
    await this.prisma.auditRetentionCategoryConfig.create({
      data: {
        id: entity.id,
        name: entity.name as PrismaAuditRetentionCategory,
        retention_years: entity.retentionYears,
        hard_delete_enabled: entity.hardDeleteEnabled,
        description: entity.description,
        action_patterns_json: entity.actionPatterns as unknown as object,
      },
    });
  }

  async update(entity: AuditRetentionCategoryConfigEntity): Promise<void> {
    await this.prisma.auditRetentionCategoryConfig.update({
      where: { id: entity.id },
      data: {
        retention_years: entity.retentionYears,
        hard_delete_enabled: entity.hardDeleteEnabled,
        description: entity.description,
        action_patterns_json: entity.actionPatterns as unknown as object,
      },
    });
  }
}
