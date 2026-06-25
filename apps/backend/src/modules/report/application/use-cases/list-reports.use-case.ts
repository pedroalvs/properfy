import type { IReportRepository, ReportFilters } from '../../domain/report.repository';
import type { ReportEntity } from '../../domain/report.entity';
import type { IReportStorageService } from '../../domain/report-storage.service';
import { PRESIGNED_URL_TTL_SECONDS } from '../../domain/report.constants';
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

interface UserReader {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}

export interface ListReportsOutput {
  data: Array<{
    id: string;
    reportType: string;
    status: string;
    format: string;
    filters: Record<string, unknown>;
    rowCount: number | null;
    requestedBy: { id: string; name: string };
    createdAt: Date;
    completedAt: Date | null;
    expiresAt: Date | null;
    errorMessage: string | null;
    fileUrl: string | null;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export class ListReportsUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly userReader?: UserReader,
    private readonly storageService?: IReportStorageService,
  ) {}

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

    // Batch-fetch user names for requestedBy
    const userIds = [...new Set(data.map((r) => r.requestedByUserId))];
    const userMap = new Map<string, string>();
    if (this.userReader) {
      await Promise.all(
        userIds.map(async (uid) => {
          const user = await this.userReader!.findById(uid);
          if (user) userMap.set(uid, user.name);
        }),
      );
    }

    const fileUrls = new Map<string, string | null>();
    if (this.storageService) {
      await Promise.all(
        data.map(async (r: ReportEntity) => {
          if (r.status === 'READY' && r.fileKey) {
            try {
              const url = await this.storageService!.generatePresignedGetUrl(r.fileKey, PRESIGNED_URL_TTL_SECONDS);
              fileUrls.set(r.id, url);
            } catch {
              fileUrls.set(r.id, null);
            }
          } else {
            fileUrls.set(r.id, null);
          }
        }),
      );
    }

    return {
      data: data.map((r: ReportEntity) => ({
        id: r.id,
        reportType: r.reportType,
        status: r.status,
        format: r.format,
        filters: r.filtersJson,
        rowCount: r.rowCount,
        requestedBy: {
          id: r.requestedByUserId,
          name: userMap.get(r.requestedByUserId) ?? 'Unknown',
        },
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        expiresAt: r.expiresAt,
        errorMessage: isOperator ? r.errorMessage : null,
        fileUrl: fileUrls.get(r.id) ?? null,
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
