import { randomUUID } from 'crypto';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { FinancialEntryEntity } from '../../domain/financial-entry.entity';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';

export interface CreateFinancialEntriesOnDoneInput {
  appointmentId: string;
}

export interface CreateFinancialEntriesOnDoneOutput {
  debitEntryId: string | null;
  payoutEntryId: string | null;
}

export class CreateFinancialEntriesOnDoneUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IIdempotencyService,
  ) {}

  async execute(input: CreateFinancialEntriesOnDoneInput): Promise<CreateFinancialEntriesOnDoneOutput> {
    const { appointmentId } = input;

    const idempotencyKey = `financial-entries-on-done:${appointmentId}`;
    const cached = await this.idempotencyService.get<CreateFinancialEntriesOnDoneOutput>(idempotencyKey, 'financial-entries-on-done');
    if (cached) {
      return cached;
    }

    // 1. Load appointment (system call, no tenant scope)
    const findResult = await this.appointmentRepo.findById(appointmentId, null);
    if (!findResult) {
      return { debitEntryId: null, payoutEntryId: null };
    }

    const { appointment } = findResult;

    // 2. Idempotency guard: only process DONE appointments
    if (appointment.status !== 'DONE') {
      return { debitEntryId: null, payoutEntryId: null };
    }

    const now = new Date();
    const currency = 'AUD';
    let debitEntryId: string | null = null;
    let payoutEntryId: string | null = null;

    // 3. Create TENANT_DEBIT if not exists
    const existingDebit = await this.financialEntryRepo.findByAppointmentAndType(
      appointmentId,
      'TENANT_DEBIT',
    );

    if (!existingDebit) {
      debitEntryId = randomUUID();
      const debitEntry = new FinancialEntryEntity({
        id: debitEntryId,
        tenantId: appointment.tenantId,
        appointmentId,
        inspectorId: null,
        entryType: 'TENANT_DEBIT',
        amount: appointment.priceAmount,
        currency,
        status: 'APPROVED',
        description: 'Inspection service debit',
        effectiveAt: now,
        initiatedByUserId: 'SYSTEM',
        approvedByUserId: null,
        approvedAt: null,
        referenceEntryId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });

      await this.financialEntryRepo.save(debitEntry);

      this.auditService.log({
        action: 'financial_entry.created',
        actorType: 'SYSTEM',
        entityType: 'FinancialEntry',
        entityId: debitEntryId,
        tenantId: appointment.tenantId,
        after: {
          entryType: 'TENANT_DEBIT',
          amount: appointment.priceAmount,
          status: 'APPROVED',
          appointmentId,
        },
      });
    }

    // 4. Create INSPECTOR_PAYOUT if not exists
    const existingPayout = await this.financialEntryRepo.findByAppointmentAndType(
      appointmentId,
      'INSPECTOR_PAYOUT',
    );

    if (!existingPayout) {
      payoutEntryId = randomUUID();
      const payoutEntry = new FinancialEntryEntity({
        id: payoutEntryId,
        tenantId: appointment.tenantId,
        appointmentId,
        inspectorId: appointment.inspectorId,
        entryType: 'INSPECTOR_PAYOUT',
        amount: appointment.payoutAmount,
        currency,
        status: 'PENDING',
        description: 'Inspector payout',
        effectiveAt: now,
        initiatedByUserId: 'SYSTEM',
        approvedByUserId: null,
        approvedAt: null,
        referenceEntryId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });

      await this.financialEntryRepo.save(payoutEntry);

      this.auditService.log({
        action: 'financial_entry.created',
        actorType: 'SYSTEM',
        entityType: 'FinancialEntry',
        entityId: payoutEntryId,
        tenantId: appointment.tenantId,
        after: {
          entryType: 'INSPECTOR_PAYOUT',
          amount: appointment.payoutAmount,
          status: 'PENDING',
          appointmentId,
          inspectorId: appointment.inspectorId,
        },
      });
    }

    const result: CreateFinancialEntriesOnDoneOutput = { debitEntryId, payoutEntryId };

    await this.idempotencyService.set(idempotencyKey, 'financial-entries-on-done', result, 24);

    return result;
  }
}
