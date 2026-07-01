import { randomUUID } from 'node:crypto';
import type { IReportRepository } from '../../domain/report.repository';
import type { IJobQueue } from '../../domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { ReportEntity } from '../../domain/report.entity';
import {
  ReportDateRangeExceededError,
  ReportConcurrentLimitExceededError,
  ReportForbiddenError,
} from '../../domain/report.errors';
import { MAX_DATE_RANGE_MONTHS, MAX_CONCURRENT_REPORTS, REPORT_DATE_AXIS_FIELD } from '../../domain/report.constants';
import type { AuthContext, RequestReportInput } from '@properfy/shared';

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
    const { reportType, filters } = input;
    const { userId, role } = auth;

    // 1. Reports are restricted to operators (AM/OP) only.
    if (role !== 'AM' && role !== 'OP') {
      throw new ReportForbiddenError();
    }

    // 2. Validate the Period span for this report type.
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

    // 3. Agency scope: AM/OP may target one agency or run cross-agency (null).
    const effectiveTenantId: string | null = filters.tenantId ?? null;

    // 4. Per-user concurrent-report guard.
    const activeCount = await this.reportRepo.countByUserAndStatuses(userId, ['PENDING', 'PROCESSING']);
    if (activeCount >= MAX_CONCURRENT_REPORTS) {
      throw new ReportConcurrentLimitExceededError();
    }

    // 5. Persist the report request. `filters_json` carries the reader filters plus a
    //    record of which real domain field the Period was applied to.
    const now = new Date();
    const reportId = randomUUID();
    const dateAxisField = reportType === 'FINANCIAL' ? 'effective_at' : REPORT_DATE_AXIS_FIELD[filters.dateAxis];
    const filtersJson: Record<string, unknown> = {
      ...filters,
      tenantId: effectiveTenantId ?? undefined,
      dateAxisField,
    };

    const report = new ReportEntity({
      id: reportId,
      tenantId: effectiveTenantId,
      reportType,
      filtersJson,
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

    // 6. Enqueue generation.
    await this.jobQueue.enqueue('report.generate', { reportId }, {
      retryLimit: 2,
      retryBackoff: true,
      retentionHours: 24,
    });

    // 7. Audit.
    this.auditService.log({
      tenantId: effectiveTenantId ?? undefined,
      actorType: 'USER',
      actorId: userId,
      entityType: 'Report',
      entityId: reportId,
      action: 'reportRequested',
      metadata: {
        reportType,
        filters: { ...filters, tenantId: effectiveTenantId, dateAxisField },
      },
    });

    return {
      reportId,
      status: 'PENDING',
      reportType,
      createdAt: now,
    };
  }
}
