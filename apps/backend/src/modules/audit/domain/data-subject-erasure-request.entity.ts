import type { ErasureRequestStatus } from '@properfy/shared';

export type DataSubjectIdentifierType = 'user_id' | 'email' | 'phone';

export interface DataSubjectErasureRequestProps {
  id: string;
  subjectIdentifierType: DataSubjectIdentifierType;
  subjectIdentifierValue: string;
  resolvedPiiValuesJson: string[] | null;
  status: ErasureRequestStatus;
  entriesFoundCount: number | null;
  entriesRedactedCount: number | null;
  entriesFlaggedForReviewCount: number | null;
  completionReportJson: Record<string, unknown> | null;
  initiatedByUserId: string;
  initiatedAt: Date;
  completedAt: Date | null;
}

/**
 * Feature 020: lifecycle entity for an AM-initiated data subject erasure
 * request. Tracks the state machine: PENDING → SCANNING → PREVIEW → CONFIRMED
 * → EXECUTING → COMPLETED / FAILED.
 */
export class DataSubjectErasureRequestEntity {
  readonly id: string;
  readonly subjectIdentifierType: DataSubjectIdentifierType;
  readonly subjectIdentifierValue: string;
  resolvedPiiValuesJson: string[] | null;
  status: ErasureRequestStatus;
  entriesFoundCount: number | null;
  entriesRedactedCount: number | null;
  entriesFlaggedForReviewCount: number | null;
  completionReportJson: Record<string, unknown> | null;
  readonly initiatedByUserId: string;
  readonly initiatedAt: Date;
  completedAt: Date | null;

  constructor(props: DataSubjectErasureRequestProps) {
    this.id = props.id;
    this.subjectIdentifierType = props.subjectIdentifierType;
    this.subjectIdentifierValue = props.subjectIdentifierValue;
    this.resolvedPiiValuesJson = props.resolvedPiiValuesJson;
    this.status = props.status;
    this.entriesFoundCount = props.entriesFoundCount;
    this.entriesRedactedCount = props.entriesRedactedCount;
    this.entriesFlaggedForReviewCount = props.entriesFlaggedForReviewCount;
    this.completionReportJson = props.completionReportJson;
    this.initiatedByUserId = props.initiatedByUserId;
    this.initiatedAt = props.initiatedAt;
    this.completedAt = props.completedAt;
  }

  markScanning(): void {
    this.status = 'SCANNING';
  }

  markPreview(found: number, flaggedForReview: number, resolvedPiiValues: string[]): void {
    this.status = 'PREVIEW';
    this.entriesFoundCount = found;
    this.entriesFlaggedForReviewCount = flaggedForReview;
    this.resolvedPiiValuesJson = resolvedPiiValues;
  }

  markConfirmed(): void {
    this.status = 'CONFIRMED';
  }

  markExecuting(): void {
    this.status = 'EXECUTING';
  }

  markCompleted(redactedCount: number, completionReport: Record<string, unknown>): void {
    this.status = 'COMPLETED';
    this.entriesRedactedCount = redactedCount;
    this.completionReportJson = completionReport;
    this.completedAt = new Date();
  }

  markFailed(errorMessage: string): void {
    this.status = 'FAILED';
    this.completionReportJson = { error: errorMessage };
    this.completedAt = new Date();
  }
}
