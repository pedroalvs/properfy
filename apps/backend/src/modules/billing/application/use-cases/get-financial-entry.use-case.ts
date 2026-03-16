import type { AuthContext } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import type { FinancialEntryOutputItem } from './list-financial-entries.use-case';
import { EntryNotFoundError } from '../../domain/billing.errors';

export interface GetFinancialEntryInput {
  entryId: string;
  actor: AuthContext;
}

export type GetFinancialEntryOutput = FinancialEntryOutputItem;

export class GetFinancialEntryUseCase {
  constructor(private readonly entryRepo: IFinancialEntryRepository) {}

  async execute(input: GetFinancialEntryInput): Promise<GetFinancialEntryOutput> {
    const { entryId, actor } = input;

    const entry = await this.entryRepo.findById(entryId);
    if (!entry) {
      throw new EntryNotFoundError();
    }

    // Scope check based on role
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      if (entry.tenantId !== actor.tenantId) {
        throw new EntryNotFoundError();
      }
    } else if (actor.role === 'INSP') {
      if (entry.inspectorId !== actor.userId || entry.entryType !== 'INSPECTOR_PAYOUT') {
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
    };
  }
}
