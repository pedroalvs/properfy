import type { ErasureRequestStatus } from '@properfy/shared';
import { ErasureRequestInvalidStateError } from './audit.errors';

export type DataSubjectIdentifierType = 'user_id' | 'email' | 'phone';

/**
 * B1 #411: allowed status transitions for the erasure request lifecycle.
 * The happy path is linear (PENDING → SCANNING → PREVIEW → CONFIRMED →
 * EXECUTING → COMPLETED); `execute()` may move PREVIEW → EXECUTING directly
 * (skipping the explicit CONFIRMED step). `FAILED` is reachable from every
 * non-terminal state. COMPLETED and FAILED are terminal.
 */
const ALLOWED_TRANSITIONS: Record<ErasureRequestStatus, ErasureRequestStatus[]> = {
  PENDING: ['SCANNING', 'FAILED'],
  SCANNING: ['PREVIEW', 'FAILED'],
  PREVIEW: ['CONFIRMED', 'EXECUTING', 'FAILED'],
  CONFIRMED: ['EXECUTING', 'FAILED'],
  EXECUTING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

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

  /**
   * B1 #411: guards a status mutation against the allowed-transition table.
   * Throws {@link ErasureRequestInvalidStateError} on an unsupported move so a
   * mutator can never blindly overwrite `status`.
   */
  private transitionTo(next: ErasureRequestStatus, action: string): void {
    if (!ALLOWED_TRANSITIONS[this.status].includes(next)) {
      throw new ErasureRequestInvalidStateError(this.status, action);
    }
    this.status = next;
  }

  markScanning(): void {
    this.transitionTo('SCANNING', 'start scanning');
  }

  markPreview(found: number, flaggedForReview: number, resolvedPiiValues: string[]): void {
    this.transitionTo('PREVIEW', 'preview');
    this.entriesFoundCount = found;
    this.entriesFlaggedForReviewCount = flaggedForReview;
    this.resolvedPiiValuesJson = resolvedPiiValues;
  }

  markConfirmed(): void {
    this.transitionTo('CONFIRMED', 'confirm');
  }

  markExecuting(): void {
    this.transitionTo('EXECUTING', 'execute');
  }

  markCompleted(redactedCount: number, completionReport: Record<string, unknown>): void {
    this.transitionTo('COMPLETED', 'complete');
    this.entriesRedactedCount = redactedCount;
    this.completionReportJson = completionReport;
    this.completedAt = new Date();
  }

  markFailed(errorMessage: string): void {
    this.transitionTo('FAILED', 'fail');
    this.completionReportJson = { error: errorMessage };
    this.completedAt = new Date();
  }
}
