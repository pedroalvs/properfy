import type { AuthContext } from '@properfy/shared';
import type { IDataSubjectErasureRequestRepository } from '../../domain/data-subject-erasure-request.repository';
import { ErasureForbiddenError } from '../../domain/audit.errors';

export interface ListDataSubjectErasureRequestsInput {
  page: number;
  pageSize: number;
  actor: AuthContext;
}

export interface ErasureRequestOutput {
  id: string;
  subjectIdentifierType: string;
  subjectIdentifierValue: string;
  status: string;
  entriesFoundCount: number | null;
  entriesRedactedCount: number | null;
  entriesFlaggedForReviewCount: number | null;
  initiatedByUserId: string;
  initiatedAt: Date;
  completedAt: Date | null;
}

/**
 * Feature 020: AM-only list of historical data subject erasure requests.
 */
export class ListDataSubjectErasureRequestsUseCase {
  constructor(private readonly repo: IDataSubjectErasureRequestRepository) {}

  async execute(input: ListDataSubjectErasureRequestsInput): Promise<{
    data: ErasureRequestOutput[];
    total: number;
  }> {
    if (input.actor.role !== 'AM') throw new ErasureForbiddenError();

    const [entities, total] = await Promise.all([
      this.repo.findAll(input.page, input.pageSize),
      this.repo.count(),
    ]);

    return {
      data: entities.map((e) => ({
        id: e.id,
        subjectIdentifierType: e.subjectIdentifierType,
        subjectIdentifierValue: e.subjectIdentifierValue,
        status: e.status,
        entriesFoundCount: e.entriesFoundCount,
        entriesRedactedCount: e.entriesRedactedCount,
        entriesFlaggedForReviewCount: e.entriesFlaggedForReviewCount,
        initiatedByUserId: e.initiatedByUserId,
        initiatedAt: e.initiatedAt,
        completedAt: e.completedAt,
      })),
      total,
    };
  }
}
