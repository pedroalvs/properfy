import type { AuthContext } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import {
  EntryNotFoundError,
  EntryNotPendingError,
  EntrySelfApprovalNotAllowedError,
} from '../../domain/billing.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface ApproveFinancialEntryInput {
  entryId: string;
  actor: AuthContext;
}

export interface ApproveFinancialEntryOutput {
  id: string;
  status: 'APPROVED';
  approvedBy: string;
  approvedAt: Date;
}

export class ApproveFinancialEntryUseCase {
  constructor(
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ApproveFinancialEntryInput): Promise<ApproveFinancialEntryOutput> {
    const { entryId, actor } = input;

    // 1. Validate actor role
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('FORBIDDEN', 'Only AM or OP can approve financial entries');
    }

    // 2. Load entry
    const entry = await this.financialEntryRepo.findById(entryId);
    if (!entry) {
      throw new EntryNotFoundError();
    }

    // 3. Check status is PENDING
    if (!entry.canBeApproved()) {
      throw new EntryNotPendingError();
    }

    // 4. Prevent self-approval
    if (entry.isSelfApproval(actor.userId)) {
      throw new EntrySelfApprovalNotAllowedError();
    }

    // 5. Approve
    const approvedAt = new Date();
    await this.financialEntryRepo.updateStatus(entryId, 'APPROVED', actor.userId, approvedAt);

    // 6. Audit log
    this.auditService.log({
      action: 'financial_entry.approved',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'FinancialEntry',
      entityId: entryId,
      tenantId: entry.tenantId,
      before: { status: 'PENDING' },
      after: { status: 'APPROVED', approvedBy: actor.userId, approvedAt: approvedAt.toISOString() },
    });

    return {
      id: entryId,
      status: 'APPROVED',
      approvedBy: actor.userId,
      approvedAt,
    };
  }
}
