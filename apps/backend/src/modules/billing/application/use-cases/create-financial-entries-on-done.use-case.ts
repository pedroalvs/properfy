import { createHash } from 'crypto';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { FinancialEntryEntity } from '../../domain/financial-entry.entity';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { SYSTEM_USER_ID } from '../../../../shared/domain/constants';
import { FinancialEntryDoneCheckRequiredError } from '../../domain/billing.errors';

export interface CreateFinancialEntriesOnDoneInput {
  appointmentId: string;
}

export interface CreateFinancialEntriesOnDoneOutput {
  debitEntryId: string | null;
  payoutEntryId: string | null;
}

const FINANCIAL_ENTRY_NAMESPACE = 'properfy-financial-entry';

function createDeterministicUuid(seed: string): string {
  const hash = createHash('sha1').update(seed).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function createFinancialEntryId(appointmentId: string, entryType: 'TENANT_DEBIT' | 'INSPECTOR_PAYOUT'): string {
  return createDeterministicUuid(`${FINANCIAL_ENTRY_NAMESPACE}:${appointmentId}:${entryType}`);
}

export class CreateFinancialEntriesOnDoneUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly tenantRepo: ITenantRepository,
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

    // 3. Validate that appointment has been cross-checked
    if (!appointment.doneCheckedByUserId) {
      throw new FinancialEntryDoneCheckRequiredError();
    }

    const tenant = await this.tenantRepo.findById(appointment.tenantId);
    const currency = tenant?.currency ?? 'AUD';

    const now = new Date();
    let debitEntryId: string | null = null;
    let payoutEntryId: string | null = null;

    // 4. Create TENANT_DEBIT if not exists
    const existingDebit = await this.financialEntryRepo.findByAppointmentAndType(
      appointmentId,
      'TENANT_DEBIT',
    );

    if (!existingDebit) {
      debitEntryId = createFinancialEntryId(appointmentId, 'TENANT_DEBIT');
      const debitEntry = new FinancialEntryEntity({
        id: debitEntryId,
        tenantId: appointment.tenantId,
        appointmentId,
        inspectorId: null,
        entryType: 'TENANT_DEBIT',
        amount: appointment.priceAmount,
        currency,
        status: 'PENDING',
        description: 'Inspection service debit',
        effectiveAt: now,
        initiatedByUserId: SYSTEM_USER_ID,
        approvedByUserId: null,
        approvedAt: null,
        referenceEntryId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });

      try {
        await this.financialEntryRepo.save(debitEntry);
      } catch (error) {
        const duplicateDebit = await this.financialEntryRepo.findByAppointmentAndType(
          appointmentId,
          'TENANT_DEBIT',
        );
        if (!duplicateDebit) {
          throw error;
        }
        debitEntryId = null;
      }

      if (debitEntryId) {
        this.auditService.log({
          action: 'financial_entry.created',
          actorType: 'SYSTEM',
          entityType: 'FinancialEntry',
          entityId: debitEntryId,
          tenantId: appointment.tenantId,
          after: {
            entryType: 'TENANT_DEBIT',
            amount: appointment.priceAmount,
            status: 'PENDING',
            appointmentId,
          },
        });
      }
    }

    // 5. Create INSPECTOR_PAYOUT if not exists
    const existingPayout = await this.financialEntryRepo.findByAppointmentAndType(
      appointmentId,
      'INSPECTOR_PAYOUT',
    );

    if (!existingPayout) {
      payoutEntryId = createFinancialEntryId(appointmentId, 'INSPECTOR_PAYOUT');
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
        initiatedByUserId: SYSTEM_USER_ID,
        approvedByUserId: null,
        approvedAt: null,
        referenceEntryId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });

      try {
        await this.financialEntryRepo.save(payoutEntry);
      } catch (error) {
        const duplicatePayout = await this.financialEntryRepo.findByAppointmentAndType(
          appointmentId,
          'INSPECTOR_PAYOUT',
        );
        if (!duplicatePayout) {
          throw error;
        }
        payoutEntryId = null;
      }

      if (payoutEntryId) {
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
    }

    const result: CreateFinancialEntriesOnDoneOutput = { debitEntryId, payoutEntryId };

    await this.idempotencyService.set(idempotencyKey, 'financial-entries-on-done', result, 24);

    return result;
  }
}
