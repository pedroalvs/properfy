import { BaseEntity } from '../../../shared/domain/entity';
import type { ReportType, ReportFormat } from '@properfy/shared';

export interface ScheduledReportProps {
  id: string;
  tenantId: string;
  reportType: ReportType;
  filtersJson: Record<string, unknown>;
  format: ReportFormat;
  cronExpression: string;
  deliveryEmail: string;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ScheduledReportEntity extends BaseEntity {
  readonly tenantId: string;
  readonly reportType: ReportType;
  readonly filtersJson: Record<string, unknown>;
  readonly format: ReportFormat;
  readonly cronExpression: string;
  readonly deliveryEmail: string;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  readonly createdByUserId: string;

  constructor(props: ScheduledReportProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.reportType = props.reportType;
    this.filtersJson = props.filtersJson;
    this.format = props.format;
    this.cronExpression = props.cronExpression;
    this.deliveryEmail = props.deliveryEmail;
    this.isActive = props.isActive;
    this.lastRunAt = props.lastRunAt;
    this.nextRunAt = props.nextRunAt;
    this.createdByUserId = props.createdByUserId;
  }

  isDue(now: Date): boolean {
    return this.isActive && this.nextRunAt !== null && this.nextRunAt <= now;
  }

  markRun(now: Date, nextRunAt: Date): void {
    this.lastRunAt = now;
    this.nextRunAt = nextRunAt;
    this.updatedAt = now;
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }
}
