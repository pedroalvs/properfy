import type { AuthContext } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import {
  EntryNotFoundError,
  EntryNotApprovedError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface VoidFinancialEntryInput {
  entryId: string;
  reason: string;
  actor: AuthContext;
}

export interface VoidFinancialEntryOutput {
  id: string;
  status: 'VOIDED';
  voidedBy: string;
  voidedAt: Date;
  voidReason: string;
}

export class VoidFinancialEntryUseCase {
  constructor(
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: VoidFinancialEntryInput): Promise<VoidFinancialEntryOutput> {
    const { entryId, reason, actor } = input;

    // 1. Validate actor role - AM only
    this.authorizationService.assertRoles(actor, ['AM'], { action: 'financial.void', entityType: 'FinancialEntry' });

    // 2. Load entry
    const entry = await this.financialEntryRepo.findById(entryId);
    if (!entry) {
      throw new EntryNotFoundError();
    }

    // 3. Check status is APPROVED
    if (!entry.canBeVoided()) {
      throw new EntryNotApprovedError();
    }

    // 4. Void the entry
    const voidedAt = new Date();
    await this.financialEntryRepo.voidEntry(entryId, entry.tenantId, actor.userId, voidedAt, reason);

    // 5. Audit log
    this.auditService.log({
      action: 'financial_entry.voided',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'FinancialEntry',
      entityId: entryId,
      tenantId: entry.tenantId,
      reason,
      before: { status: 'APPROVED' },
      after: { status: 'VOIDED', voidedBy: actor.userId, voidedAt: voidedAt.toISOString(), voidReason: reason },
    });

    return {
      id: entryId,
      status: 'VOIDED',
      voidedBy: actor.userId,
      voidedAt,
      voidReason: reason,
    };
  }
}
