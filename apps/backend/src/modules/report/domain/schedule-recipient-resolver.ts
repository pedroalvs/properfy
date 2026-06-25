import type { ScheduledReportEntity } from './scheduled-report.entity';
import type { ReportEntity } from './report.entity';

export type RecipientSkipReason =
  | 'owner_deactivated'
  | 'user_deactivated'
  | 'user_not_found'
  | 'wrong_tenant'
  | 'missing_permission'
  | 'restricted_report_type'
  | 'no_email';

export interface ResolvedRecipient {
  userId: string;
  email: string | null;
  name: string | null;
  accessValid: boolean;
  skipReason?: RecipientSkipReason;
}

/**
 * Feature 019: interface for resolving a schedule's delivery recipient list.
 *
 * The resolver encapsulates the delivery-mode branching:
 *   - OWNER_ONLY → [the schedule creator]
 *   - RECIPIENT_LIST → validate each `schedule.recipientUserIds` entry
 *   - TENANT_WIDE → query all users in the schedule's tenant with report access
 *
 * Every recipient is validated against the current report-type permission rules
 * (restricted types need AM/OP; CL_USER needs `export_reports`). Invalid recipients
 * are still returned with `accessValid = false` so the delivery use case can log
 * the per-recipient outcome on the run.
 */
export interface IScheduleRecipientResolver {
  resolve(schedule: ScheduledReportEntity, report: ReportEntity): Promise<ResolvedRecipient[]>;
}
