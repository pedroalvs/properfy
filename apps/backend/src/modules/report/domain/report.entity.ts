import { BaseEntity } from '../../../shared/domain/entity';
import type { ReportType, ReportStatus } from '@properfy/shared';

export interface ReportProps {
  id: string;
  tenantId: string | null;
  reportType: ReportType;
  filtersJson: Record<string, unknown>;
  status: ReportStatus;
  fileKey: string | null;
  requestedByUserId: string;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  errorMessage: string | null;
  rowCount: number | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ReportEntity extends BaseEntity {
  readonly tenantId: string | null;
  readonly reportType: ReportType;
  readonly filtersJson: Record<string, unknown>;
  status: ReportStatus;
  fileKey: string | null;
  readonly requestedByUserId: string;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  errorMessage: string | null;
  rowCount: number | null;
  expiresAt: Date | null;

  constructor(props: ReportProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.reportType = props.reportType;
    this.filtersJson = props.filtersJson;
    this.status = props.status;
    this.fileKey = props.fileKey;
    this.requestedByUserId = props.requestedByUserId;
    this.startedAt = props.startedAt;
    this.completedAt = props.completedAt;
    this.failedAt = props.failedAt;
    this.errorMessage = props.errorMessage;
    this.rowCount = props.rowCount;
    this.expiresAt = props.expiresAt;
  }

  isPending(): boolean {
    return this.status === 'PENDING';
  }

  isProcessing(): boolean {
    return this.status === 'PROCESSING';
  }

  isReady(): boolean {
    return this.status === 'READY';
  }

  isFailed(): boolean {
    return this.status === 'FAILED';
  }

  isExpired(): boolean {
    return this.expiresAt !== null && this.expiresAt < new Date();
  }

  canBeDownloaded(): boolean {
    return this.isReady() && !this.isExpired() && this.fileKey !== null;
  }

  markProcessing(): void {
    this.status = 'PROCESSING';
    this.startedAt = new Date();
    this.updatedAt = new Date();
  }

  markReady(fileKey: string, rowCount: number): void {
    this.status = 'READY';
    this.fileKey = fileKey;
    this.rowCount = rowCount;
    this.completedAt = new Date();
    const expiresAt = new Date(this.completedAt);
    expiresAt.setDate(expiresAt.getDate() + 30);
    this.expiresAt = expiresAt;
    this.updatedAt = new Date();
  }

  markFailed(errorMessage: string): void {
    this.status = 'FAILED';
    this.errorMessage = errorMessage;
    this.failedAt = new Date();
    this.updatedAt = new Date();
  }
}
