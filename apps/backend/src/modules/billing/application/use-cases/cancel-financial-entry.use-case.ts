import type { AuthContext } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import {
  EntryNotFoundError,
  EntryNotPendingError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface CancelFinancialEntryInput {
  entryId: string;
  reason: string;
  actor: AuthContext;
}

export interface CancelFinancialEntryOutput {
  id: string;
  status: 'CANCELLED';
  cancelledBy: string;
  cancelledAt: Date;
}

export class CancelFinancialEntryUseCase {
  constructor(
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: CancelFinancialEntryInput): Promise<CancelFinancialEntryOutput> {
    const { entryId, reason, actor } = input;

    // 1. Validate actor role
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'financial.cancel', entityType: 'FinancialEntry' });

    // 2. Load entry
    const entry = await this.financialEntryRepo.findById(entryId);
    if (!entry) {
      throw new EntryNotFoundError();
    }

    // 3. Check status is PENDING
    if (!entry.isPending()) {
      throw new EntryNotPendingError();
    }

    // 4. Cancel (validate PENDING -> CANCELLED transition)
    const cancelledAt = new Date();
    await this.financialEntryRepo.transitionStatus(entryId, entry.tenantId, 'PENDING', 'CANCELLED');

    // 5. Audit log
    this.auditService.log({
      action: 'financial_entry.cancelled',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'FinancialEntry',
      entityId: entryId,
      tenantId: entry.tenantId,
      reason,
      before: { status: 'PENDING' },
      after: { status: 'CANCELLED', cancelledBy: actor.userId, cancelledAt: cancelledAt.toISOString() },
    });

    return {
      id: entryId,
      status: 'CANCELLED',
      cancelledBy: actor.userId,
      cancelledAt,
    };
  }
}
