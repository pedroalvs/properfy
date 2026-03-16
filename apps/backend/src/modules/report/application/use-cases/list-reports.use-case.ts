import type { IReportRepository, ReportFilters } from '../../domain/report.repository';
import type { ReportEntity } from '../../domain/report.entity';
import type { ReportType, ReportStatus } from '@properfy/shared';

export interface ListReportsInput {
  reportType?: ReportType;
  status?: ReportStatus;
  fromDate?: string;
  toDate?: string;
  page: number;
  pageSize: number;
}

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: string;
}

export interface ListReportsOutput {
  data: Array<{
    id: string;
    reportType: string;
    status: string;
    format: string;
    filters: Record<string, unknown>;
    rowCount: number | null;
    requestedByUserId: string;
    createdAt: Date;
    completedAt: Date | null;
    expiresAt: Date | null;
    errorMessage: string | null;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export class ListReportsUseCase {
  constructor(private readonly reportRepo: IReportRepository) {}

  async execute(input: ListReportsInput, auth: AuthContext): Promise<ListReportsOutput> {
    const { reportType, status, fromDate, toDate, page, pageSize } = input;
    const { userId, tenantId, role } = auth;

    const filters: ReportFilters = {};
    if (reportType) filters.reportType = reportType;
    if (status) filters.status = status;
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;

    // CL roles only see own reports
    if (role !== 'AM' && role !== 'OP') {
      filters.requestedByUserId = userId;
      if (tenantId) filters.tenantId = tenantId;
    }

    const [data, total] = await Promise.all([
      this.reportRepo.findAll(filters, page, pageSize),
      this.reportRepo.count(filters),
    ]);

    const isOperator = role === 'AM' || role === 'OP';

    return {
      data: data.map((r: ReportEntity) => ({
        id: r.id,
        reportType: r.reportType,
        status: r.status,
        format: r.format,
        filters: r.filtersJson,
        rowCount: r.rowCount,
        requestedByUserId: r.requestedByUserId,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        expiresAt: r.expiresAt,
        errorMessage: isOperator ? r.errorMessage : null,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
