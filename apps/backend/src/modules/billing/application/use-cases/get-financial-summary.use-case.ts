import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { requireAgencyTenantScope } from '../agency-scope';
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
    } else if (actor.role === 'OP') {
      // OP is the platform operational team (tenantId is null → platform-wide).
      tenantId = actor.tenantId ?? undefined;
    } else if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      // Fail closed: an agency read must be tenant-scoped. Never fall back to an
      // unscoped (cross-tenant) summary when the JWT lacks a tenant.
      tenantId = requireAgencyTenantScope(actor);
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view financial summary');
    }

    const dateRange = (input.effectiveFrom || input.effectiveTo)
      ? { effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo }
      : undefined;

    // 031 — Agencies must not see the platform↔inspector leg. Push the exclusion
    // into the query rather than zeroing `totalPayouts` afterwards: every aggregate
    // comes from one groupBy, so a post-hoc patch left `totalAdjustments` summing
    // inspector-scoped adjustments and `pendingCount` counting pending payouts.
    const isAgency = actor.role === 'CL_ADMIN' || actor.role === 'CL_USER';
    const scoped = await this.entryRepo.getSummary(
      tenantId,
      dateRange,
      isAgency ? { agencyScoped: true } : undefined,
    );

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
