import type { AuthContext } from '@properfy/shared';
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
      if (entry.tenantId !== actor.tenantId) {
        throw new EntryNotFoundError();
      }
    } else if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      if (entry.inspectorId !== actor.inspectorId || entry.entryType !== 'INSPECTOR_PAYOUT') {
        throw new EntryNotFoundError();
      }
    }
    // AM/OP can see any entry

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
      approvedByUserId: entry.approvedByUserId,
      approvedAt: entry.approvedAt ? entry.approvedAt.toISOString() : null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      appointmentCode,
      relatedEntityName,
      approvedByName,
    };
  }
}
