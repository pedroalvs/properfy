import { randomUUID } from 'crypto';
import type { AuthContext } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { FinancialEntryEntity } from '../../domain/financial-entry.entity';
import {
  EntryNotFoundError,
  EntryNotRefundableError,
  RefundExceedsOriginalAmountError,
} from '../../domain/billing.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';

export interface CreateRefundInput {
  entryId: string;
  description: string;
  reason: string;
  amount?: number;
  idempotencyKey?: string;
  actor: AuthContext;
}

export interface CreateRefundOutput {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  entryType: 'REFUND';
  amount: number;
  currency: string;
  status: 'PENDING';
  description: string;
  reason: string;
  referenceEntryId: string;
  initiatedByUserId: string;
  createdAt: Date;
}

export class CreateRefundUseCase {
  constructor(
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IIdempotencyService,
  ) {}

  async execute(input: CreateRefundInput): Promise<CreateRefundOutput> {
    const { entryId, description, reason, actor } = input;

    // 1. Validate actor role
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('FORBIDDEN', 'Only AM or OP can create refunds');
    }

    // 1.5 Idempotency check
    if (input.idempotencyKey) {
      const cached = await this.idempotencyService.get<CreateRefundOutput>(input.idempotencyKey, 'refund');
      if (cached) {
        return cached;
      }
    }

    // 2. Load original entry
    const original = await this.financialEntryRepo.findById(entryId);
    if (!original) {
      throw new EntryNotFoundError();
    }

    // 3. Validate original is an approved TENANT_DEBIT
    if (original.entryType !== 'TENANT_DEBIT' || !original.isApproved()) {
      throw new EntryNotRefundableError();
    }

    // 4. Compute refund amount and validate against cap
    const refundAmount = input.amount ?? original.amount;
    const existingRefundsTotal = await this.financialEntryRepo.sumRefundsByReferenceEntryId(entryId);
    const remainingRefundable = original.amount - existingRefundsTotal;

    if (refundAmount > remainingRefundable) {
      throw new RefundExceedsOriginalAmountError(refundAmount, remainingRefundable);
    }

    // 5. Create refund entry
    const now = new Date();
    const id = randomUUID();

    const refundEntry = new FinancialEntryEntity({
      id,
      tenantId: original.tenantId,
      appointmentId: original.appointmentId,
      inspectorId: null,
      entryType: 'REFUND',
      amount: refundAmount,
      currency: original.currency,
      status: 'PENDING',
      description,
      effectiveAt: now,
      initiatedByUserId: actor.userId,
      approvedByUserId: null,
      approvedAt: null,
      referenceEntryId: original.id,
      reason,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Persist
    await this.financialEntryRepo.save(refundEntry);

    // 7. Audit log
    this.auditService.log({
      action: 'financial_entry.refund_created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'FinancialEntry',
      entityId: id,
      tenantId: original.tenantId,
      after: {
        entryType: 'REFUND',
        amount: refundAmount,
        referenceEntryId: original.id,
        appointmentId: original.appointmentId,
        reason,
      },
    });

    const result: CreateRefundOutput = {
      id,
      tenantId: original.tenantId,
      appointmentId: original.appointmentId,
      entryType: 'REFUND',
      amount: refundAmount,
      currency: original.currency,
      status: 'PENDING',
      description,
      reason,
      referenceEntryId: original.id,
      initiatedByUserId: actor.userId,
      createdAt: now,
    };

    if (input.idempotencyKey) {
      await this.idempotencyService.set(input.idempotencyKey, 'refund', result, 24);
    }

    return result;
  }
}
