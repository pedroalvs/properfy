import type { AuthContext } from '@properfy/shared';
import type {
  IFinancialEntryRepository,
  FinancialEntryFilters,
  FinancialEntryPagination,
} from '../../domain/financial-entry.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface ListFinancialEntriesInput {
  type?: string;
  status?: string;
  inspectorId?: string;
  tenantId?: string;
  fromDate?: string;
  toDate?: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  actor: AuthContext;
}

export interface FinancialEntryOutputItem {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  inspectorId: string | null;
  entryType: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  effectiveAt: string;
  reason: string | null;
  referenceEntryId: string | null;
  initiatedByUserId: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Enriched fields
  appointmentCode: string | null;
  relatedEntityName: string | null;
  approvedByName: string | null;
}

export interface ListFinancialEntriesOutput {
  data: FinancialEntryOutputItem[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListFinancialEntriesUseCase {
  constructor(
    private readonly entryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ListFinancialEntriesInput): Promise<ListFinancialEntriesOutput> {
    const { actor } = input;

    const filters: FinancialEntryFilters = {};
    const pagination: FinancialEntryPagination = {
      page: input.page,
      pageSize: input.pageSize,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
    };

    if (actor.role === 'AM') {
      // AM only: can filter by any tenantId; if none provided, returns all
      if (input.tenantId) filters.tenantId = input.tenantId;
      if (input.inspectorId) filters.inspectorId = input.inspectorId;
      if (input.type) filters.entryType = input.type as FinancialEntryFilters['entryType'];
      if (input.status) filters.status = input.status as FinancialEntryFilters['status'];

      // Audit cross-tenant access
      const isCrossTenant = input.tenantId && input.tenantId !== actor.tenantId;
      if (isCrossTenant) {
        this.auditService.log({
          action: 'financial_entry.cross_tenant_list',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'FinancialEntry',
          tenantId: input.tenantId,
          metadata: {
            actorRole: actor.role,
            actorTenantId: actor.tenantId,
            targetTenantId: input.tenantId,
          },
        });
      }
    } else if (actor.role === 'OP' || actor.role === 'CL_ADMIN') {
      // OP is tenant-scoped per CORRECTION-001 (2026-04-13); CL_ADMIN reads
      // own-tenant entries. CL_USER is denied at the route layer (RBAC guard).
      filters.tenantId = actor.tenantId!;
      if (input.inspectorId) filters.inspectorId = input.inspectorId;
      if (input.type) filters.entryType = input.type as FinancialEntryFilters['entryType'];
      if (input.status) filters.status = input.status as FinancialEntryFilters['status'];
    } else if (actor.role === 'INSP') {
      // Inspectors: forced inspectorId and entryType
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      filters.inspectorId = actor.inspectorId;
      filters.entryType = 'INSPECTOR_PAYOUT';
      if (input.tenantId) filters.tenantId = input.tenantId;
      if (input.status) filters.status = input.status as FinancialEntryFilters['status'];
    } else {
      throw new ForbiddenError('FORBIDDEN', 'Not authorized to list financial entries');
    }

    if (input.fromDate) filters.fromDate = input.fromDate;
    if (input.toDate) filters.toDate = input.toDate;

    const [enriched, total] = await Promise.all([
      this.entryRepo.findAllEnriched(filters, pagination),
      this.entryRepo.count(filters),
    ]);

    return {
      data: enriched.map(({ entity: entry, appointmentCode, relatedEntityName, approvedByName }) => {
        const approval =
          entry.status === 'APPROVED'
            ? {
                approvedByUserId: entry.approvedByUserId,
                approvedAt: entry.approvedAt ? entry.approvedAt.toISOString() : null,
                approvedByName,
              }
            : {
                approvedByUserId: null,
                approvedAt: null,
                approvedByName: null,
              };

        return {
          id: entry.id,
          tenantId: entry.tenantId,
          appointmentId: entry.appointmentId,
          inspectorId: entry.inspectorId,
          entryType: entry.entryType,
          amount: Number(entry.amount),
          currency: entry.currency,
          status: entry.status,
          description: entry.description,
          effectiveAt: entry.effectiveAt.toISOString(),
          reason: entry.reason,
          referenceEntryId: entry.referenceEntryId,
          initiatedByUserId: entry.initiatedByUserId,
          approvedByUserId: approval.approvedByUserId,
          approvedAt: approval.approvedAt,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
          appointmentCode,
          relatedEntityName,
          approvedByName: approval.approvedByName,
        };
      }),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
}
