import { randomUUID } from 'node:crypto';
import type { IReportRepository } from '../../domain/report.repository';
import type { IJobQueue } from '../../domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { ReportEntity } from '../../domain/report.entity';
import {
  ReportTenantScopeViolationError,
  ReportDateRangeExceededError,
  ReportConcurrentLimitExceededError,
  ReportTypeForbiddenError,
} from '../../domain/report.errors';
import {
  MAX_DATE_RANGE_MONTHS,
  MAX_CONCURRENT_REPORTS,
  RESTRICTED_REPORT_TYPES,
} from '../../domain/report.constants';
import type { ReportType, ReportFormat } from '@properfy/shared';

export interface RequestReportInput {
  reportType: ReportType;
  filters: {
    fromDate: string;
    toDate: string;
    tenantId?: string;
    serviceTypeId?: string;
    branchId?: string;
    inspectorId?: string;
    status?: string;
    tenantConfirmationStatus?: string;
    search?: string;
    emailNotificationStatus?: string;
  };
  format: ReportFormat;
}

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: string;
}

export interface RequestReportOutput {
  reportId: string;
  status: string;
  reportType: string;
  createdAt: Date;
}

export class RequestReportUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly jobQueue: IJobQueue,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: RequestReportInput, auth: AuthContext): Promise<RequestReportOutput> {
    const { reportType, filters, format } = input;
    const { userId, tenantId, role } = auth;

    // 1. Check restricted report types
    if (RESTRICTED_REPORT_TYPES.includes(reportType) && role !== 'AM' && role !== 'OP') {
      throw new ReportTypeForbiddenError();
    }

    // 2. Validate date range
    const fromDate = new Date(filters.fromDate);
    const toDate = new Date(filters.toDate);
    const maxMonths = MAX_DATE_RANGE_MONTHS[reportType];
    if (maxMonths) {
      const maxDate = new Date(fromDate);
      maxDate.setMonth(maxDate.getMonth() + maxMonths);
      if (toDate > maxDate) {
        throw new ReportDateRangeExceededError(maxMonths);
      }
    }

    // 3. Enforce tenant scope
    let effectiveTenantId: string | null = null;
    if (role === 'CL_ADMIN' || role === 'CL_USER') {
      if (filters.tenantId && filters.tenantId !== tenantId) {
        throw new ReportTenantScopeViolationError();
      }
      effectiveTenantId = tenantId;
    } else {
      effectiveTenantId = filters.tenantId ?? null;
    }

    // 4. Check concurrent limit
    const activeCount = await this.reportRepo.countByUserAndStatuses(userId, ['PENDING', 'PROCESSING']);
    if (activeCount >= MAX_CONCURRENT_REPORTS) {
      throw new ReportConcurrentLimitExceededError();
    }

    // 5. Create report entity
    const now = new Date();
    const reportId = randomUUID();
    const report = new ReportEntity({
      id: reportId,
      tenantId: effectiveTenantId,
      reportType,
      filtersJson: { ...filters, tenantId: effectiveTenantId ?? filters.tenantId },
      format,
      status: 'PENDING',
      fileKey: null,
      requestedByUserId: userId,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      errorMessage: null,
      rowCount: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await this.reportRepo.save(report);

    // 6. Enqueue job
    await this.jobQueue.enqueue('report.generate', { reportId }, {
      retryLimit: 2,
      retryBackoff: true,
      retentionHours: 24,
    });

    // 7. Audit log
    this.auditService.log({
      tenantId: effectiveTenantId ?? undefined,
      actorType: 'USER',
      actorId: userId,
      entityType: 'Report',
      entityId: reportId,
      action: 'reportRequested',
      metadata: { reportType, filters: { ...filters, tenantId: effectiveTenantId }, format },
    });

    return {
      reportId,
      status: 'PENDING',
      reportType,
      createdAt: now,
    };
  }
}
