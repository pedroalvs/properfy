import { BaseEntity } from '../../../shared/domain/entity';
import type { ScheduleRunStatus } from '@properfy/shared';

/**
 * Feature 019: per-recipient delivery outcome stored inside `delivery_status_json`.
 */
export interface DeliveryOutcome {
  userId: string;
  email: string;
  status: 'delivered' | 'skipped' | 'failed';
  notificationId?: string;
  reason?: string;
}

export interface ScheduledReportRunProps {
  id: string;
  scheduleId: string;
  reportId: string | null;
  status: ScheduleRunStatus;
  scheduledFor: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  recipientCount: number | null;
  deliveryStatusJson: DeliveryOutcome[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ScheduledReportRunEntity extends BaseEntity {
  readonly scheduleId: string;
  reportId: string | null;
  status: ScheduleRunStatus;
  readonly scheduledFor: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  recipientCount: number | null;
  deliveryStatusJson: DeliveryOutcome[] | null;

  constructor(props: ScheduledReportRunProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.scheduleId = props.scheduleId;
    this.reportId = props.reportId;
    this.status = props.status;
    this.scheduledFor = props.scheduledFor;
    this.startedAt = props.startedAt;
    this.completedAt = props.completedAt;
    this.errorMessage = props.errorMessage;
    this.recipientCount = props.recipientCount;
    this.deliveryStatusJson = props.deliveryStatusJson;
  }

  markRunning(now: Date = new Date()): void {
    this.status = 'running';
    this.startedAt = now;
    this.updatedAt = now;
  }

  markCompleted(now: Date, recipientCount: number, deliveryStatus: DeliveryOutcome[]): void {
    this.status = 'completed';
    this.completedAt = now;
    this.recipientCount = recipientCount;
    this.deliveryStatusJson = deliveryStatus;
    this.updatedAt = now;
  }

  markFailed(now: Date, errorMessage: string, deliveryStatus: DeliveryOutcome[] | null = null): void {
    this.status = 'failed';
    this.completedAt = now;
    this.errorMessage = errorMessage;
    if (deliveryStatus) {
      this.deliveryStatusJson = deliveryStatus;
    }
    this.updatedAt = now;
  }

  markSkippedCatchup(now: Date = new Date()): void {
    this.status = 'skipped_catchup';
    this.completedAt = now;
    this.updatedAt = now;
  }

  markSkippedEmpty(now: Date): void {
    this.status = 'skipped_empty';
    this.completedAt = now;
    this.recipientCount = 0;
    this.updatedAt = now;
  }
}
