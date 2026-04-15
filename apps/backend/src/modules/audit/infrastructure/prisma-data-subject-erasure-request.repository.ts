import type { PrismaClient, Prisma } from '@prisma/client';
import type { ErasureRequestStatus as PrismaErasureRequestStatus } from '@prisma/client';
import {
  DataSubjectErasureRequestEntity,
  type DataSubjectIdentifierType,
} from '../domain/data-subject-erasure-request.entity';
import type { IDataSubjectErasureRequestRepository } from '../domain/data-subject-erasure-request.repository';

function mapToEntity(row: any): DataSubjectErasureRequestEntity {
  return new DataSubjectErasureRequestEntity({
    id: row.id,
    subjectIdentifierType: row.subject_identifier_type as DataSubjectIdentifierType,
    subjectIdentifierValue: row.subject_identifier_value,
    resolvedPiiValuesJson: Array.isArray(row.resolved_pii_values_json)
      ? (row.resolved_pii_values_json as string[])
      : null,
    status: row.status,
    entriesFoundCount: row.entries_found_count ?? null,
    entriesRedactedCount: row.entries_redacted_count ?? null,
    entriesFlaggedForReviewCount: row.entries_flagged_for_review_count ?? null,
    completionReportJson:
      (row.completion_report_json as Record<string, unknown> | null) ?? null,
    initiatedByUserId: row.initiated_by_user_id,
    initiatedAt: row.initiated_at,
    completedAt: row.completed_at ?? null,
  });
}

export class PrismaDataSubjectErasureRequestRepository
  implements IDataSubjectErasureRequestRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<DataSubjectErasureRequestEntity | null> {
    const row = await this.prisma.dataSubjectErasureRequest.findUnique({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async findAll(page: number, pageSize: number): Promise<DataSubjectErasureRequestEntity[]> {
    const rows = await this.prisma.dataSubjectErasureRequest.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { initiated_at: 'desc' },
    });
    return rows.map(mapToEntity);
  }

  async count(): Promise<number> {
    return this.prisma.dataSubjectErasureRequest.count();
  }

  async save(entity: DataSubjectErasureRequestEntity): Promise<void> {
    await this.prisma.dataSubjectErasureRequest.create({
      data: {
        id: entity.id,
        subject_identifier_type: entity.subjectIdentifierType,
        subject_identifier_value: entity.subjectIdentifierValue,
        resolved_pii_values_json: (entity.resolvedPiiValuesJson ?? null) as unknown as Prisma.InputJsonValue,
        status: entity.status as PrismaErasureRequestStatus,
        entries_found_count: entity.entriesFoundCount,
        entries_redacted_count: entity.entriesRedactedCount,
        entries_flagged_for_review_count: entity.entriesFlaggedForReviewCount,
        completion_report_json: (entity.completionReportJson ?? null) as Prisma.InputJsonValue,
        initiated_by_user_id: entity.initiatedByUserId,
        initiated_at: entity.initiatedAt,
        completed_at: entity.completedAt,
      },
    });
  }

  async update(entity: DataSubjectErasureRequestEntity): Promise<void> {
    await this.prisma.dataSubjectErasureRequest.update({
      where: { id: entity.id },
      data: {
        resolved_pii_values_json: (entity.resolvedPiiValuesJson ?? null) as unknown as Prisma.InputJsonValue,
        status: entity.status as PrismaErasureRequestStatus,
        entries_found_count: entity.entriesFoundCount,
        entries_redacted_count: entity.entriesRedactedCount,
        entries_flagged_for_review_count: entity.entriesFlaggedForReviewCount,
        completion_report_json: (entity.completionReportJson ?? null) as Prisma.InputJsonValue,
        completed_at: entity.completedAt,
      },
    });
  }
}
