import type { PrismaClient } from '@prisma/client';
import type { PiiClassification } from '@properfy/shared';
import { PiiFieldMappingEntity } from '../domain/pii-field-mapping.entity';
import type { IPiiFieldMappingRepository } from '../domain/pii-field-mapping.repository';

function mapToEntity(row: any): PiiFieldMappingEntity {
  return new PiiFieldMappingEntity({
    id: row.id,
    actionPattern: row.action_pattern,
    jsonFieldPath: row.json_field_path,
    classification: row.classification as PiiClassification,
    requiresManualReview: row.requires_manual_review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaPiiFieldMappingRepository implements IPiiFieldMappingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<PiiFieldMappingEntity[]> {
    const rows = await this.prisma.piiFieldMapping.findMany({ orderBy: { action_pattern: 'asc' } });
    return rows.map(mapToEntity);
  }

  async findByAction(action: string): Promise<PiiFieldMappingEntity[]> {
    // Prefix match: the mapping's action_pattern must be a prefix of `action`.
    // Use LIKE on the inverse: patterns whose value starts `action` from offset 0.
    // Simpler: fetch all, filter in app layer — the registry is small (< 100 rows).
    const rows = await this.prisma.piiFieldMapping.findMany();
    return rows.map(mapToEntity).filter((m) => m.appliesTo(action));
  }

  async findById(id: string): Promise<PiiFieldMappingEntity | null> {
    const row = await this.prisma.piiFieldMapping.findUnique({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async save(entity: PiiFieldMappingEntity): Promise<void> {
    await this.prisma.piiFieldMapping.create({
      data: {
        id: entity.id,
        action_pattern: entity.actionPattern,
        json_field_path: entity.jsonFieldPath,
        classification: entity.classification,
        requires_manual_review: entity.requiresManualReview,
      },
    });
  }

  async update(entity: PiiFieldMappingEntity): Promise<void> {
    await this.prisma.piiFieldMapping.update({
      where: { id: entity.id },
      data: {
        action_pattern: entity.actionPattern,
        json_field_path: entity.jsonFieldPath,
        classification: entity.classification,
        requires_manual_review: entity.requiresManualReview,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.piiFieldMapping.delete({ where: { id } });
  }
}
