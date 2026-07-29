import { type AuthContext, AGENCY_VISIBLE_ENTRY_TYPES } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import type { FinancialEntryOutputItem } from './list-financial-entries.use-case';
import { EntryNotFoundError } from '../../domain/billing.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface GetFinancialEntryInput {
  entryId: string;
  actor: AuthContext;
}

export type GetFinancialEntryOutput = FinancialEntryOutputItem;

export class GetFinancialEntryUseCase {
  constructor(private readonly entryRepo: IFinancialEntryRepository) {}

  async execute(input: GetFinancialEntryInput): Promise<GetFinancialEntryOutput> {
    const { entryId, actor } = input;

    // For CL roles, scope at repo level (defense-in-depth)
    const repoTenantId = (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') ? actor.tenantId ?? undefined : undefined;
    const enriched = await this.entryRepo.findByIdEnriched(entryId, repoTenantId);
    if (!enriched) {
      throw new EntryNotFoundError();
    }

    const { entity: entry, appointmentCode, relatedEntityName, approvedByName } = enriched;

    // Scope check based on role
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      // 031 — an agency sees its own tenant AND only agency-visible entries. The
      // entry-type allowlist alone is not enough: an inspector-scoped
      // MANUAL_ADJUSTMENT passes it yet still belongs to the platform<->inspector
      // leg. 404 rather than 403 — a 403 would confirm the entry exists.
      if (entry.tenantId !== actor.tenantId) {
        throw new EntryNotFoundError();
      }
      if (!AGENCY_VISIBLE_ENTRY_TYPES.includes(entry.entryType) || entry.inspectorId !== null) {
        throw new EntryNotFoundError();
      }
    } else if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      if (entry.inspectorId !== actor.inspectorId || entry.entryType !== 'INSPECTOR_PAYOUT') {
        throw new EntryNotFoundError();
      }
    } else if (actor.role !== 'AM' && actor.role !== 'OP') {
      // Fail closed for any other role rather than falling through to full access,
      // matching the sibling list use case. No TNT/SYS token is issued today, but
      // the platform side must be an allowlist, not the default branch.
      throw new ForbiddenError('FORBIDDEN', 'Not authorized to view financial entries');
    }
    // AM/OP (platform) can see any entry

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
  }
}
