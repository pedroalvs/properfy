import { randomUUID } from 'crypto';
import type { AuthContext } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { FinancialEntryEntity } from '../../domain/financial-entry.entity';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';

export interface CreateManualAdjustmentInput {
  tenantId: string;
  appointmentId?: string;
  inspectorId?: string;
  amount: number;
  description: string;
  reason: string;
  effectiveAt?: Date;
  referenceEntryId?: string;
  idempotencyKey?: string;
  actor: AuthContext;
}

export interface CreateManualAdjustmentOutput {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  inspectorId: string | null;
  entryType: 'MANUAL_ADJUSTMENT';
  amount: number;
  currency: string;
  status: 'PENDING';
  description: string;
  reason: string;
  effectiveAt: Date;
  initiatedByUserId: string;
  referenceEntryId: string | null;
  createdAt: Date;
}

export class CreateManualAdjustmentUseCase {
  constructor(
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly tenantRepo: ITenantRepository,
  ) {}

  async execute(input: CreateManualAdjustmentInput): Promise<CreateManualAdjustmentOutput> {
    const { actor } = input;

    // 1. Validate actor role
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('FORBIDDEN', 'Only AM or OP can create manual adjustments');
    }

    // 1.5 Idempotency check (external key from Idempotency-Key header)
    if (input.idempotencyKey) {
      const cached = await this.idempotencyService.get<CreateManualAdjustmentOutput>(input.idempotencyKey, 'manual-adjustment');
      if (cached) {
        return cached;
      }
    }

    // 2. Resolve tenant currency
    const tenant = await this.tenantRepo.findById(input.tenantId);
    const currency = tenant?.currency ?? 'AUD';

    // 3. Create entry
    const now = new Date();
    const id = randomUUID();
    const effectiveAt = input.effectiveAt ?? now;

    const entry = new FinancialEntryEntity({
      id,
      tenantId: input.tenantId,
      appointmentId: input.appointmentId ?? null,
      inspectorId: input.inspectorId ?? null,
      entryType: 'MANUAL_ADJUSTMENT',
      amount: input.amount,
      currency,
      status: 'PENDING',
      description: input.description,
      effectiveAt,
      initiatedByUserId: actor.userId,
      approvedByUserId: null,
      approvedAt: null,
      referenceEntryId: input.referenceEntryId ?? null,
      reason: input.reason,
      createdAt: now,
      updatedAt: now,
    });

    // 4. Persist
    await this.financialEntryRepo.save(entry);

    // 5. Audit log
    this.auditService.log({
      action: 'financial_entry.manual_adjustment_created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'FinancialEntry',
      entityId: id,
      tenantId: input.tenantId,
      after: {
        entryType: 'MANUAL_ADJUSTMENT',
        amount: input.amount,
        description: input.description,
        reason: input.reason,
        appointmentId: input.appointmentId ?? null,
        inspectorId: input.inspectorId ?? null,
      },
    });

    const result: CreateManualAdjustmentOutput = {
      id,
      tenantId: input.tenantId,
      appointmentId: input.appointmentId ?? null,
      inspectorId: input.inspectorId ?? null,
      entryType: 'MANUAL_ADJUSTMENT',
      amount: input.amount,
      currency,
      status: 'PENDING',
      description: input.description,
      reason: input.reason,
      effectiveAt,
      initiatedByUserId: actor.userId,
      referenceEntryId: input.referenceEntryId ?? null,
      createdAt: now,
    };

    if (input.idempotencyKey) {
      await this.idempotencyService.set(input.idempotencyKey, 'manual-adjustment', result, 24);
    }

    return result;
  }
}
