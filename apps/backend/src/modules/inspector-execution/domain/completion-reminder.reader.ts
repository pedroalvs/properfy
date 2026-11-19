/**
 * Read model for the completion reminder (F03, 03.16 / L-F03-03, D22). Kept as a
 * dedicated port so `SendCompletionRemindersUseCase` stays pure and unit-testable;
 * the Prisma impl carries the SELECT described in the task (SCHEDULED, inspector
 * assigned, not deleted, near today).
 */

export type CompletionReminderExecutionState = 'NONE' | 'IN_PROGRESS' | 'FINISHED';

export interface CompletionReminderCandidate {
  appointmentId: string;
  tenantId: string;
  inspectorId: string;
  /** Formatted service code, e.g. "INS-0042". */
  appointmentCode: string;
  /** Property address line shown on the locked screen (never the tenant's details). */
  propertyAddress: string;
  /** Civil date of the job (UTC midnight for the agency civil day). */
  scheduledDate: Date;
  /** Booked window end as bare HH:mm wall-clock in the agency timezone. */
  timeSlotEnd: string;
  /** Execution state; an abandoned check-in reads as NONE. */
  executionState: CompletionReminderExecutionState;
}

/** An inspector's currently-open check-in, for the "busy" suppression. */
export interface InProgressExecutionRef {
  inspectorId: string;
  appointmentId: string;
  startedAt: Date;
}

export interface ICompletionReminderReader {
  /**
   * SCHEDULED appointments with an inspector assigned whose civil date is within
   * [now−1d, now+1d] (UTC, to cover every agency timezone), left-joined to their
   * execution state. The use case narrows to "today in the agency tz" and applies
   * the post-window delay. A finished execution is excluded here (the job would be
   * DONE); an abandoned one reads as NONE.
   */
  findCandidates(now: Date): Promise<CompletionReminderCandidate[]>;
  /** Open (in-progress, non-abandoned) check-ins for the given inspectors. */
  findInProgressByInspectorIds(inspectorIds: string[]): Promise<InProgressExecutionRef[]>;
}
