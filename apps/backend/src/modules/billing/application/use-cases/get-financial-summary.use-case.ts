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

    // Only AM is cross-tenant per Sprint 1 W-4-IMPL (CORRECTION-001 close-it).
    let tenantId: string | undefined;
    if (actor.role === 'AM') {
      tenantId = input.tenantId;
    } else if (actor.role === 'OP' || actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      tenantId = actor.tenantId!;
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view financial summary');
    }

    const dateRange = (input.effectiveFrom || input.effectiveTo)
      ? { effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo }
      : undefined;

    const summary = await this.entryRepo.getSummary(tenantId, dateRange);

    // 031 — Agencies must not see inspector payouts (the platform↔inspector leg
    // and thus the platform's margin). Hide the aggregate from CL roles.
    const isAgency = actor.role === 'CL_ADMIN' || actor.role === 'CL_USER';
    const scoped = isAgency ? { ...summary, totalPayouts: 0 } : summary;

    if (!tenantId) {
      return scoped;
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError();
    }

    return {
      ...scoped,
      currency: tenant.currency,
    };
  }
}
