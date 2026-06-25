import type { AuthContext } from '@properfy/shared';
import type { IDataSubjectErasureRequestRepository } from '../../domain/data-subject-erasure-request.repository';
import {
  ErasureForbiddenError,
  ErasureRequestNotFoundError,
} from '../../domain/audit.errors';

export interface GetDataSubjectErasureRequestInput {
  requestId: string;
  actor: AuthContext;
}

/**
 * Feature 020: AM-only fetch of a single erasure request (for the preview
 * screen and status polling). Returns the same shape as list.
 */
export class GetDataSubjectErasureRequestUseCase {
  constructor(private readonly repo: IDataSubjectErasureRequestRepository) {}

  async execute(input: GetDataSubjectErasureRequestInput) {
    if (input.actor.role !== 'AM') throw new ErasureForbiddenError();

    const entity = await this.repo.findById(input.requestId);
    if (!entity) throw new ErasureRequestNotFoundError();

    return {
      id: entity.id,
      subjectIdentifierType: entity.subjectIdentifierType,
      subjectIdentifierValue: entity.subjectIdentifierValue,
      status: entity.status,
      entriesFoundCount: entity.entriesFoundCount,
      entriesRedactedCount: entity.entriesRedactedCount,
      entriesFlaggedForReviewCount: entity.entriesFlaggedForReviewCount,
      resolvedPiiValuesJson: entity.resolvedPiiValuesJson,
      completionReportJson: entity.completionReportJson,
      initiatedByUserId: entity.initiatedByUserId,
      initiatedAt: entity.initiatedAt,
      completedAt: entity.completedAt,
    };
  }
}
