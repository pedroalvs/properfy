import { randomUUID } from 'crypto';
import type { DomainEvent } from '../../../../shared/application/events/domain-event-bus';
import type { IFinancialEntryRepository } from '../../../billing/domain/financial-entry.repository';
import { FinancialEntryEntity } from '../../../billing/domain/financial-entry.entity';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { SYSTEM_USER_ID } from '../../../../shared/domain/constants';

export interface DoneRejectedPayload {
  appointmentId: string;
  tenantId: string;
  rejectedByUserId: string;
  reason: string | null;
}

export class CompensateFinancialOnDoneRejectedHandler {
  constructor(
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const { appointmentId, tenantId, rejectedByUserId, reason } =
      event.payload as unknown as DoneRejectedPayload;

    // 1. Find existing TENANT_DEBIT for this appointment
    const tenantDebit = await this.financialEntryRepo.findByAppointmentAndType(
      appointmentId,
      'TENANT_DEBIT',
    );

    // 2. Find existing INSPECTOR_PAYOUT for this appointment
    const inspectorPayout = await this.financialEntryRepo.findByAppointmentAndType(
      appointmentId,
      'INSPECTOR_PAYOUT',
    );

    if (!tenantDebit && !inspectorPayout) {
      // No financial entries to compensate — nothing to do
      this.auditService.log({
        action: 'financial_entry.done_rejected_no_entries',
        actorType: 'SYSTEM',
        entityType: 'Appointment',
        entityId: appointmentId,
        tenantId,
        metadata: {
          rejectedByUserId,
          reason,
          message: 'No financial entries found for DONE->REJECTED appointment',
        },
      });
      return;
    }

    const now = new Date();
    const compensationReason = `Automatic compensation: appointment rejected after DONE. ${reason ?? ''}`.trim();

    // 3. Create REFUND for tenant debit if one exists
    if (tenantDebit) {
      // Check if a refund already exists for this entry
      const existingRefund = await this.financialEntryRepo.findByReferenceEntryIdAndType(
        tenantDebit.id,
        'REFUND',
      );

      if (!existingRefund) {
        const refundId = randomUUID();
        const refundEntry = new FinancialEntryEntity({
          id: refundId,
          tenantId: tenantDebit.tenantId,
          appointmentId,
          inspectorId: null,
          entryType: 'REFUND',
          amount: tenantDebit.amount,
          currency: tenantDebit.currency,
          status: 'PENDING',
          description: `Refund for tenant debit — appointment rejected after completion`,
          effectiveAt: now,
          initiatedByUserId: SYSTEM_USER_ID,
          approvedByUserId: null,
          approvedAt: null,
          referenceEntryId: tenantDebit.id,
          reason: compensationReason,
          createdAt: now,
          updatedAt: now,
        });

        await this.financialEntryRepo.save(refundEntry);

        this.auditService.log({
          action: 'financial_entry.refund_created',
          actorType: 'SYSTEM',
          entityType: 'FinancialEntry',
          entityId: refundId,
          tenantId: tenantDebit.tenantId,
          after: {
            entryType: 'REFUND',
            amount: tenantDebit.amount,
            referenceEntryId: tenantDebit.id,
            appointmentId,
            reason: compensationReason,
            triggeredBy: 'done_rejected_compensation',
          },
        });
      }
    }

    // 4. Create reversal (MANUAL_ADJUSTMENT with negative amount) for inspector payout if one exists
    if (inspectorPayout) {
      // Check if a reversal already exists for this payout
      const existingReversal = await this.financialEntryRepo.findByReferenceEntryIdAndType(
        inspectorPayout.id,
        'MANUAL_ADJUSTMENT',
      );

      if (!existingReversal) {
        const reversalId = randomUUID();
        const reversalEntry = new FinancialEntryEntity({
          id: reversalId,
          tenantId: inspectorPayout.tenantId,
          appointmentId,
          inspectorId: inspectorPayout.inspectorId,
          entryType: 'MANUAL_ADJUSTMENT',
          amount: -inspectorPayout.amount,
          currency: inspectorPayout.currency,
          status: 'PENDING',
          description: `Payout reversal — appointment rejected after completion`,
          effectiveAt: now,
          initiatedByUserId: SYSTEM_USER_ID,
          approvedByUserId: null,
          approvedAt: null,
          referenceEntryId: inspectorPayout.id,
          reason: compensationReason,
          createdAt: now,
          updatedAt: now,
        });

        await this.financialEntryRepo.save(reversalEntry);

        this.auditService.log({
          action: 'financial_entry.reversal_created',
          actorType: 'SYSTEM',
          entityType: 'FinancialEntry',
          entityId: reversalId,
          tenantId: inspectorPayout.tenantId,
          after: {
            entryType: 'MANUAL_ADJUSTMENT',
            amount: -inspectorPayout.amount,
            referenceEntryId: inspectorPayout.id,
            appointmentId,
            inspectorId: inspectorPayout.inspectorId,
            reason: compensationReason,
            triggeredBy: 'done_rejected_compensation',
          },
        });
      }
    }
  }
}
