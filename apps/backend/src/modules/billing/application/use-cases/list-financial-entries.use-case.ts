import type { AuthContext } from '@properfy/shared';
import type {
  IFinancialEntryRepository,
  FinancialEntryFilters,
  FinancialEntryPagination,
} from '../../domain/financial-entry.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';

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
  amount: string;
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
}

export interface ListFinancialEntriesOutput {
  data: FinancialEntryOutputItem[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListFinancialEntriesUseCase {
  constructor(private readonly entryRepo: IFinancialEntryRepository) {}

  async execute(input: ListFinancialEntriesInput): Promise<ListFinancialEntriesOutput> {
    const { actor } = input;

    const filters: FinancialEntryFilters = {};
    const pagination: FinancialEntryPagination = {
      page: input.page,
      pageSize: input.pageSize,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
    };

    if (actor.role === 'AM' || actor.role === 'OP') {
      // AM/OP can filter by any tenantId; if none provided, returns all
      if (input.tenantId) filters.tenantId = input.tenantId;
      if (input.inspectorId) filters.inspectorId = input.inspectorId;
      if (input.type) filters.entryType = input.type as FinancialEntryFilters['entryType'];
      if (input.status) filters.status = input.status as FinancialEntryFilters['status'];
    } else if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      // Client roles: forced tenantId from JWT, ignore query param
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
    }

    if (input.fromDate) filters.fromDate = input.fromDate;
    if (input.toDate) filters.toDate = input.toDate;

    const [data, total] = await Promise.all([
      this.entryRepo.findAll(filters, pagination),
      this.entryRepo.count(filters),
    ]);

    return {
      data: data.map((entry) => ({
        id: entry.id,
        tenantId: entry.tenantId,
        appointmentId: entry.appointmentId,
        inspectorId: entry.inspectorId,
        entryType: entry.entryType,
        amount: entry.amount.toString(),
        currency: entry.currency,
        status: entry.status,
        description: entry.description,
        effectiveAt: entry.effectiveAt.toISOString(),
        reason: entry.reason,
        referenceEntryId: entry.referenceEntryId,
        initiatedByUserId: entry.initiatedByUserId,
        approvedByUserId: entry.approvedByUserId,
        approvedAt: entry.approvedAt ? entry.approvedAt.toISOString() : null,
        createdAt: entry.createdAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
}
