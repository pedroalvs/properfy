import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IFinancialEntryRepository, FinancialEntrySummary } from '../../domain/financial-entry.repository';

export interface GetFinancialSummaryInput {
  tenantId?: string;
  actor: AuthContext;
}

export class GetFinancialSummaryUseCase {
  constructor(private readonly entryRepo: IFinancialEntryRepository) {}

  async execute(input: GetFinancialSummaryInput): Promise<FinancialEntrySummary> {
    const { actor } = input;

    let tenantId: string | undefined;
    if (actor.role === 'AM' || actor.role === 'OP') {
      tenantId = input.tenantId;
    } else if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      tenantId = actor.tenantId!;
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view financial summary');
    }

    return this.entryRepo.getSummary(tenantId);
  }
}
