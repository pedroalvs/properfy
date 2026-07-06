import type { AuthContext, FinancialEntryType } from '@properfy/shared';
import type {
  IFinancialEntryRepository,
  FinancialEntryFilters,
  FinancialEntryPagination,
} from '../../domain/financial-entry.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { requireAgencyTenantScope } from '../agency-scope';

/**
 * Entry types an Agency (CL_ADMIN / CL_USER) may see in its financial statement.
 * INSPECTOR_PAYOUT is deliberately excluded — it is the platform↔inspector leg.
 */
const AGENCY_ENTRY_TYPES: FinancialEntryType[] = ['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT'];

export interface ListFinancialEntriesInput {
  type?: string;
  status?: string;
  inspectorId?: string;
  tenantId?: string;
  appointmentId?: string;
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
    } else if (actor.role === 'OP') {
      // OP is tenant-scoped per CORRECTION-001 (2026-04-13). OP is the platform
      // operational team and sees all entry types (incl. INSPECTOR_PAYOUT).
      filters.tenantId = actor.tenantId!;
      if (input.inspectorId) filters.inspectorId = input.inspectorId;
      if (input.type) filters.entryType = input.type as FinancialEntryFilters['entryType'];
      if (input.status) filters.status = input.status as FinancialEntryFilters['status'];
    } else if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      // 031 — Agency read (extrato): own-tenant, restricted to agency-visible
      // entry types. INSPECTOR_PAYOUT is the platform↔inspector leg and must
      // never be exposed to an agency. The `view_financials` flag (CL_USER) is
      // enforced at the route layer, not here.
      // Fail closed: never fall back to an unscoped read when the JWT lacks a
      // tenant (the repository skips the tenant filter for a falsy tenantId).
      filters.tenantId = requireAgencyTenantScope(actor);
      if (input.type) {
        if (!AGENCY_ENTRY_TYPES.includes(input.type as FinancialEntryType)) {
          throw new ForbiddenError('FORBIDDEN', 'Agencies cannot view this entry type');
        }
        filters.entryType = input.type as FinancialEntryFilters['entryType'];
      } else {
        filters.entryTypeIn = [...AGENCY_ENTRY_TYPES];
      }
      if (input.status) filters.status = input.status as FinancialEntryFilters['status'];
      // Note: an inspectorId filter is intentionally NOT honored for agencies.
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

    // Additive filter, applied after role-scoping above — never a bypass.
    // AM/OP see the appointment's full ledger; agencies/inspectors keep
    // their existing entry-type and tenant/inspector restrictions.
    if (input.appointmentId) filters.appointmentId = input.appointmentId;

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
