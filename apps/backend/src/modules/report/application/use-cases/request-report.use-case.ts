import { randomUUID } from 'node:crypto';
import type { IReportRepository } from '../../domain/report.repository';
import type { IJobQueue } from '../../domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { ReportEntity } from '../../domain/report.entity';
import {
  ReportTenantScopeViolationError,
  ReportDateRangeExceededError,
  ReportConcurrentLimitExceededError,
  ReportTenantConcurrentLimitExceededError,
  ReportTypeForbiddenError,
  ReportInvalidColumnsError,
} from '../../domain/report.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  MAX_DATE_RANGE_MONTHS,
  MAX_CONCURRENT_REPORTS,
  RESTRICTED_REPORT_TYPES,
  REPORT_COLUMN_KEYS,
  DEFAULT_TENANT_MAX_CONCURRENT_REPORTS,
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
  columns?: string[];
}

import type { AuthContext } from '@properfy/shared';

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
    private readonly tenantRepo?: ITenantRepository,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(input: RequestReportInput, auth: AuthContext): Promise<RequestReportOutput> {
    const { reportType, filters, format, columns } = input;
    const { userId, tenantId, role } = auth;

    // 1. Check restricted report types
    if (RESTRICTED_REPORT_TYPES.includes(reportType) && role !== 'AM' && role !== 'OP') {
      throw new ReportTypeForbiddenError();
    }

    // 1b. Check CL_USER export_reports permission
    if (role === 'CL_USER') {
      if (!tenantId) {
        throw new ForbiddenError('FORBIDDEN', 'Missing tenant context');
      }
      if (this.authorizationService) {
        this.authorizationService.assertClUserPermission(auth, 'export_reports');
      }
    }

    // 1c. Validate user-defined columns against whitelist
    if (columns && columns.length > 0) {
      const validKeys = REPORT_COLUMN_KEYS[reportType];
      if (validKeys) {
        const invalidColumns = columns.filter((c) => !validKeys.has(c));
        if (invalidColumns.length > 0) {
          throw new ReportInvalidColumnsError(invalidColumns);
        }
      }
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

    // 4. Check per-user concurrent limit
    const activeCount = await this.reportRepo.countByUserAndStatuses(userId, ['PENDING', 'PROCESSING']);
    if (activeCount >= MAX_CONCURRENT_REPORTS) {
      throw new ReportConcurrentLimitExceededError();
    }

    // 4b. Check per-tenant concurrent limit
    if (effectiveTenantId) {
      let maxTenantConcurrent = DEFAULT_TENANT_MAX_CONCURRENT_REPORTS;
      if (this.tenantRepo) {
        const tenant = await this.tenantRepo.findById(effectiveTenantId);
        if (tenant) {
          const settings = tenant.settingsJson ?? {};
          const configured = settings.maxConcurrentReports;
          if (typeof configured === 'number' && configured >= 1 && configured <= 50) {
            maxTenantConcurrent = configured;
          }
        }
      }
      const tenantActiveCount = await this.reportRepo.countByTenantAndStatuses(
        effectiveTenantId,
        ['PENDING', 'PROCESSING'],
      );
      if (tenantActiveCount >= maxTenantConcurrent) {
        throw new ReportTenantConcurrentLimitExceededError();
      }
    }

    // 5. Create report entity
    const now = new Date();
    const reportId = randomUUID();
    const filtersJson: Record<string, unknown> = {
      ...filters,
      tenantId: effectiveTenantId ?? filters.tenantId,
    };
    if (columns && columns.length > 0) {
      filtersJson.columns = columns;
    }
    const report = new ReportEntity({
      id: reportId,
      tenantId: effectiveTenantId,
      reportType,
      filtersJson,
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
