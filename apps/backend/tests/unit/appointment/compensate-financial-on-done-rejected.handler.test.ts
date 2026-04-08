import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompensateFinancialOnDoneRejectedHandler } from '../../../src/modules/appointment/application/handlers/compensate-financial-on-done-rejected.handler';
import { FinancialEntryEntity } from '../../../src/modules/billing/domain/financial-entry.entity';
import { DomainEventBus, APPOINTMENT_EVENTS } from '../../../src/shared/application/events/domain-event-bus';
import type { DomainEvent } from '../../../src/shared/application/events/domain-event-bus';

// --- Helpers ---

function makeDoneRejectedEvent(overrides: Partial<{
  appointmentId: string;
  tenantId: string;
  rejectedByUserId: string;
  reason: string | null;
}> = {}): DomainEvent {
  return {
    type: APPOINTMENT_EVENTS.DONE_REJECTED,
    payload: {
      appointmentId: 'appt-1',
      tenantId: 'tenant-1',
      rejectedByUserId: 'user-am-1',
      reason: 'Inspection was fraudulent',
      ...overrides,
    },
    occurredAt: new Date(),
  };
}

function makeFinancialEntry(overrides: Partial<ConstructorParameters<typeof FinancialEntryEntity>[0]> = {}): FinancialEntryEntity {
  return new FinancialEntryEntity({
    id: 'entry-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    inspectorId: null,
    entryType: 'TENANT_DEBIT',
    amount: 200,
    currency: 'AUD',
    status: 'PENDING',
    description: 'Inspection service debit',
    effectiveAt: new Date(),
    initiatedByUserId: 'SYSTEM',
    approvedByUserId: null,
    approvedAt: null,
    referenceEntryId: null,
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

// --- Mocks ---

const financialEntryRepo = {
  findById: vi.fn(),
  findByIdEnriched: vi.fn(),
  findAllEnriched: vi.fn(),
  getSummary: vi.fn(),
  findByAppointmentAndType: vi.fn(),
  findByReferenceEntryIdAndType: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  updateStatus: vi.fn(),
  transitionStatus: vi.fn(),
  sumApprovedPayoutsForInspectorInPeriod: vi.fn(),
};

const auditService = {
  log: vi.fn(),
};

function makeHandler(): CompensateFinancialOnDoneRejectedHandler {
  return new CompensateFinancialOnDoneRejectedHandler(
    financialEntryRepo as any,
    auditService as any,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  financialEntryRepo.save.mockResolvedValue(undefined);
});

// =============================================================================
// Handler unit tests
// =============================================================================

describe('CompensateFinancialOnDoneRejectedHandler', () => {
  it('creates REFUND for existing TENANT_DEBIT entry', async () => {
    const tenantDebit = makeFinancialEntry({
      id: 'debit-1',
      entryType: 'TENANT_DEBIT',
      amount: 200,
    });
    financialEntryRepo.findByAppointmentAndType
      .mockResolvedValueOnce(tenantDebit) // TENANT_DEBIT
      .mockResolvedValueOnce(null); // INSPECTOR_PAYOUT
    financialEntryRepo.findByReferenceEntryIdAndType.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.handle(makeDoneRejectedEvent());

    expect(financialEntryRepo.save).toHaveBeenCalledTimes(1);
    const savedEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(savedEntry.entryType).toBe('REFUND');
    expect(savedEntry.amount).toBe(200);
    expect(savedEntry.referenceEntryId).toBe('debit-1');
    expect(savedEntry.appointmentId).toBe('appt-1');
    expect(savedEntry.status).toBe('PENDING');
    expect(savedEntry.initiatedByUserId).toBe('SYSTEM');
  });

  it('creates MANUAL_ADJUSTMENT reversal for existing INSPECTOR_PAYOUT entry', async () => {
    const inspectorPayout = makeFinancialEntry({
      id: 'payout-1',
      entryType: 'INSPECTOR_PAYOUT',
      amount: 140,
      inspectorId: 'insp-1',
    });
    financialEntryRepo.findByAppointmentAndType
      .mockResolvedValueOnce(null) // TENANT_DEBIT
      .mockResolvedValueOnce(inspectorPayout); // INSPECTOR_PAYOUT
    financialEntryRepo.findByReferenceEntryIdAndType.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.handle(makeDoneRejectedEvent());

    expect(financialEntryRepo.save).toHaveBeenCalledTimes(1);
    const savedEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(savedEntry.entryType).toBe('MANUAL_ADJUSTMENT');
    expect(savedEntry.amount).toBe(-140);
    expect(savedEntry.referenceEntryId).toBe('payout-1');
    expect(savedEntry.inspectorId).toBe('insp-1');
    expect(savedEntry.appointmentId).toBe('appt-1');
    expect(savedEntry.status).toBe('PENDING');
  });

  it('creates both REFUND and reversal when both entries exist', async () => {
    const tenantDebit = makeFinancialEntry({
      id: 'debit-1',
      entryType: 'TENANT_DEBIT',
      amount: 200,
    });
    const inspectorPayout = makeFinancialEntry({
      id: 'payout-1',
      entryType: 'INSPECTOR_PAYOUT',
      amount: 140,
      inspectorId: 'insp-1',
    });
    financialEntryRepo.findByAppointmentAndType
      .mockResolvedValueOnce(tenantDebit) // TENANT_DEBIT
      .mockResolvedValueOnce(inspectorPayout); // INSPECTOR_PAYOUT
    financialEntryRepo.findByReferenceEntryIdAndType.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.handle(makeDoneRejectedEvent());

    expect(financialEntryRepo.save).toHaveBeenCalledTimes(2);

    const refundEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(refundEntry.entryType).toBe('REFUND');
    expect(refundEntry.amount).toBe(200);

    const reversalEntry = financialEntryRepo.save.mock.calls[1][0] as FinancialEntryEntity;
    expect(reversalEntry.entryType).toBe('MANUAL_ADJUSTMENT');
    expect(reversalEntry.amount).toBe(-140);
  });

  it('logs audit when no financial entries exist', async () => {
    financialEntryRepo.findByAppointmentAndType
      .mockResolvedValueOnce(null) // TENANT_DEBIT
      .mockResolvedValueOnce(null); // INSPECTOR_PAYOUT

    const handler = makeHandler();
    await handler.handle(makeDoneRejectedEvent());

    expect(financialEntryRepo.save).not.toHaveBeenCalled();
    const noEntriesLog = (auditService.log as any).mock.calls.find(
      (c: any[]) => c[0].action === 'financial_entry.done_rejected_no_entries',
    );
    expect(noEntriesLog).toBeDefined();
    expect(noEntriesLog[0].entityId).toBe('appt-1');
  });

  it('skips REFUND creation when refund already exists for the debit entry', async () => {
    const tenantDebit = makeFinancialEntry({
      id: 'debit-1',
      entryType: 'TENANT_DEBIT',
      amount: 200,
    });
    const existingRefund = makeFinancialEntry({
      id: 'refund-existing',
      entryType: 'REFUND',
      referenceEntryId: 'debit-1',
    });
    financialEntryRepo.findByAppointmentAndType
      .mockResolvedValueOnce(tenantDebit) // TENANT_DEBIT
      .mockResolvedValueOnce(null); // INSPECTOR_PAYOUT
    financialEntryRepo.findByReferenceEntryIdAndType.mockResolvedValue(existingRefund);

    const handler = makeHandler();
    await handler.handle(makeDoneRejectedEvent());

    expect(financialEntryRepo.save).not.toHaveBeenCalled();
  });

  it('skips reversal creation when adjustment already exists for the payout entry', async () => {
    const inspectorPayout = makeFinancialEntry({
      id: 'payout-1',
      entryType: 'INSPECTOR_PAYOUT',
      amount: 140,
      inspectorId: 'insp-1',
    });
    const existingReversal = makeFinancialEntry({
      id: 'reversal-existing',
      entryType: 'MANUAL_ADJUSTMENT',
      referenceEntryId: 'payout-1',
    });
    financialEntryRepo.findByAppointmentAndType
      .mockResolvedValueOnce(null) // TENANT_DEBIT
      .mockResolvedValueOnce(inspectorPayout); // INSPECTOR_PAYOUT
    financialEntryRepo.findByReferenceEntryIdAndType.mockResolvedValue(existingReversal);

    const handler = makeHandler();
    await handler.handle(makeDoneRejectedEvent());

    expect(financialEntryRepo.save).not.toHaveBeenCalled();
  });

  it('includes reason in compensation description', async () => {
    const tenantDebit = makeFinancialEntry({
      id: 'debit-1',
      entryType: 'TENANT_DEBIT',
      amount: 200,
    });
    financialEntryRepo.findByAppointmentAndType
      .mockResolvedValueOnce(tenantDebit)
      .mockResolvedValueOnce(null);
    financialEntryRepo.findByReferenceEntryIdAndType.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.handle(makeDoneRejectedEvent({ reason: 'Fraud detected' }));

    const savedEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(savedEntry.reason).toContain('Fraud detected');
    expect(savedEntry.reason).toContain('Automatic compensation');
  });

  it('emits audit logs for created refund and reversal entries', async () => {
    const tenantDebit = makeFinancialEntry({
      id: 'debit-1',
      entryType: 'TENANT_DEBIT',
      amount: 200,
    });
    const inspectorPayout = makeFinancialEntry({
      id: 'payout-1',
      entryType: 'INSPECTOR_PAYOUT',
      amount: 140,
      inspectorId: 'insp-1',
    });
    financialEntryRepo.findByAppointmentAndType
      .mockResolvedValueOnce(tenantDebit)
      .mockResolvedValueOnce(inspectorPayout);
    financialEntryRepo.findByReferenceEntryIdAndType.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.handle(makeDoneRejectedEvent());

    const refundAudit = (auditService.log as any).mock.calls.find(
      (c: any[]) => c[0].action === 'financial_entry.refund_created',
    );
    expect(refundAudit).toBeDefined();
    expect(refundAudit[0].after.triggeredBy).toBe('done_rejected_compensation');

    const reversalAudit = (auditService.log as any).mock.calls.find(
      (c: any[]) => c[0].action === 'financial_entry.reversal_created',
    );
    expect(reversalAudit).toBeDefined();
    expect(reversalAudit[0].after.triggeredBy).toBe('done_rejected_compensation');
  });
});

// =============================================================================
// Integration with DomainEventBus
// =============================================================================

describe('CompensateFinancialOnDoneRejectedHandler – event bus integration', () => {
  it('handler is called when DONE_REJECTED event is emitted', async () => {
    const eventBus = new DomainEventBus();
    const handler = makeHandler();
    const handleSpy = vi.spyOn(handler, 'handle');

    financialEntryRepo.findByAppointmentAndType.mockResolvedValue(null);

    eventBus.subscribe(APPOINTMENT_EVENTS.DONE_REJECTED, (event) => handler.handle(event));

    await eventBus.emit(makeDoneRejectedEvent());

    expect(handleSpy).toHaveBeenCalledTimes(1);
    expect(handleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: APPOINTMENT_EVENTS.DONE_REJECTED,
        payload: expect.objectContaining({
          appointmentId: 'appt-1',
          tenantId: 'tenant-1',
        }),
      }),
    );
  });
});
