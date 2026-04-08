import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IFinancialEntryRepository, FinancialEntrySummary } from '../../domain/financial-entry.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { TenantNotFoundError } from '../../../tenant/domain/tenant.errors';

export interface GetFinancialSummaryInput {
  tenantId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  actor: AuthContext;
}

export class GetFinancialSummaryUseCase {
  constructor(
    private readonly entryRepo: IFinancialEntryRepository,
    private readonly tenantRepo: ITenantRepository,
  ) {}

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

    const dateRange = (input.effectiveFrom || input.effectiveTo)
      ? { effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo }
      : undefined;

    const summary = await this.entryRepo.getSummary(tenantId, dateRange);

    if (!tenantId) {
      return summary;
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError();
    }

    return {
      ...summary,
      currency: tenant.currency,
    };
  }
}
