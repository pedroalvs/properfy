import type { ReportType } from '@properfy/shared';

export type ScheduleStatus = 'ACTIVE' | 'PAUSED';
export type ScheduleDeliveryMode = 'OWNER_ONLY' | 'RECIPIENT_LIST' | 'TENANT_WIDE';
export type ScheduleRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped_catchup'
  | 'skipped_empty';

export type StructuredRecurrence =
  | { type: 'daily'; hour: number }
  | { type: 'weekly'; dayOfWeek: number; hour: number }
  | { type: 'monthly'; dayOfMonth: number; hour: number };

export interface ScheduledReport {
  id: string;
  tenantId: string;
  reportType: ReportType;
  filtersJson: Record<string, unknown>;
  format: 'XLSX' | 'CSV' | 'PDF';
  cronExpression: string;
  displayName: string | null;
  deliveryMode: ScheduleDeliveryMode;
  recipientUserIds: string[];
  skipDeliveryWhenEmpty: boolean;
  consecutiveFailureCount: number;
  status: ScheduleStatus;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: ScheduleRunStatus | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledReportRun {
  id: string;
  scheduleId: string;
  reportId: string | null;
  status: ScheduleRunStatus;
  scheduledFor: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  recipientCount: number | null;
  createdAt: string;
}

export interface CreateScheduledReportPayload {
  reportType: ReportType;
  filtersJson: Record<string, unknown>;
  format: 'XLSX' | 'CSV' | 'PDF';
  recurrence: StructuredRecurrence;
  deliveryMode: ScheduleDeliveryMode;
  recipientUserIds: string[];
  displayName?: string;
  skipDeliveryWhenEmpty: boolean;
}
