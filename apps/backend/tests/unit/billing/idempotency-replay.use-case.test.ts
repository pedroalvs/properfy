/**
 * Real (non-mocked) idempotency-service dedup coverage for the B1 replay-safe
 * Idempotency-Key requirement (audit-specs/billing.md §B1).
 *
 * Every other unit test in this directory mocks `IIdempotencyService` and
 * asserts call arguments — that proves the use case *calls* the port
 * correctly, but would stay green even if the acquire/complete/release wiring
 * were removed entirely, since the mock always resolves however the test
 * tells it to. This file drives each of the 7 idempotent use cases against
 * `InMemoryIdempotencyService`, a real Map-backed implementation of the port,
 * and proves the actual dedup behavior: the mutation repository method runs
 * exactly once across two replayed calls, both calls return an equal
 * response, and a third call with the same key but a different payload is
 * rejected as a conflict.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateManualAdjustmentUseCase } from '../../../src/modules/billing/application/use-cases/create-manual-adjustment.use-case';
import { CreateRefundUseCase } from '../../../src/modules/billing/application/use-cases/create-refund.use-case';
import { VoidFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/void-financial-entry.use-case';
import { ApproveFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/approve-financial-entry.use-case';
import { MarkInvoicePaidUseCase } from '../../../src/modules/billing/application/use-cases/mark-invoice-paid.use-case';
import { BatchMarkInvoicesPaidUseCase } from '../../../src/modules/billing/application/use-cases/batch-mark-invoices-paid.use-case';
import { ReverseInvoicePaymentUseCase } from '../../../src/modules/billing/application/use-cases/reverse-invoice-payment.use-case';
import { FinancialEntryEntity } from '../../../src/modules/billing/domain/financial-entry.entity';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import { BillingIdempotencyPayloadMismatchError } from '../../../src/modules/billing/domain/billing.errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { InMemoryIdempotencyService } from '../../helpers/in-memory-idempotency.service';

const auditService = { log: vi.fn() };
const authorizationService = new AuthorizationService(auditService as any);

const opActor = {
  userId: 'op-1',
  tenantId: 'tenant-1',
  role: 'OP' as const,
  branchId: null,
  inspectorId: null,
};

function makeApprovedDebit(overrides: Record<string, unknown> = {}) {
  return new FinancialEntryEntity({
    id: 'debit-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    inspectorId: null,
    entryType: 'TENANT_DEBIT',
    amount: 200,
    currency: 'AUD',
    status: 'APPROVED',
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

function makePendingPayout(overrides: Record<string, unknown> = {}) {
  return new FinancialEntryEntity({
    id: 'entry-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    entryType: 'INSPECTOR_PAYOUT',
    amount: 140,
    currency: 'AUD',
    status: 'PENDING',
    description: 'Inspector payout',
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

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return new InspectorInvoiceEntity({
    id: 'inv-1',
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'FORTNIGHTLY',
    status: 'CLOSED',
    totalAmount: 1200,
    currency: 'AUD',
    fileKey: 'invoices/inv-1.xlsx',
    previousInvoiceId: null,
    generatedByUserId: 'op-1',
    issuedAt: new Date('2026-03-16T10:00:00.000Z'),
    paidAt: null,
    paidByUserId: null,
    paymentReference: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('idempotency replay (real InMemoryIdempotencyService)', () => {
  it('CreateManualAdjustmentUseCase: dedups on replay, conflicts on payload mismatch', async () => {
    const financialEntryRepo = {
      findById: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const tenantRepo = { findById: vi.fn().mockResolvedValue({ id: 'tenant-1', currency: 'AUD', isActive: () => true }) };
    const appointmentRepo = { findById: vi.fn() };
    const inspectorRepo = { findById: vi.fn() };
    const idempotencyService = new InMemoryIdempotencyService();

    const sut = new CreateManualAdjustmentUseCase(
      financialEntryRepo as any,
      auditService as any,
      idempotencyService,
      tenantRepo as any,
      appointmentRepo as any,
      inspectorRepo as any,
      authorizationService,
    );

    const input = {
      tenantId: 'tenant-1',
      amount: 50,
      description: 'Late fee adjustment',
      reason: 'Inspector arrived late',
      idempotencyKey: 'dedup-key-1',
      actor: opActor,
    };

    const first = await sut.execute(input);
    const second = await sut.execute({ ...input });

    expect(financialEntryRepo.save).toHaveBeenCalledOnce();
    expect(second).toEqual(first);

    await expect(sut.execute({ ...input, amount: 999 })).rejects.toThrow(BillingIdempotencyPayloadMismatchError);
    expect(financialEntryRepo.save).toHaveBeenCalledOnce();
  });

  it('CreateRefundUseCase: dedups on replay, conflicts on payload mismatch', async () => {
    const financialEntryRepo = {
      findById: vi.fn().mockResolvedValue(makeApprovedDebit()),
      save: vi.fn().mockResolvedValue(undefined),
      sumRefundsByReferenceEntryId: vi.fn().mockResolvedValue(0),
    };
    const idempotencyService = new InMemoryIdempotencyService();

    const sut = new CreateRefundUseCase(financialEntryRepo as any, auditService as any, idempotencyService, authorizationService);

    const input = {
      entryId: 'debit-1',
      description: 'Service not executed',
      reason: 'Inspector did not show up',
      idempotencyKey: 'dedup-key-2',
      actor: opActor,
    };

    const first = await sut.execute(input);
    const second = await sut.execute({ ...input });

    expect(financialEntryRepo.save).toHaveBeenCalledOnce();
    expect(second).toEqual(first);

    await expect(sut.execute({ ...input, amount: 1 })).rejects.toThrow(BillingIdempotencyPayloadMismatchError);
    expect(financialEntryRepo.save).toHaveBeenCalledOnce();
  });

  it('VoidFinancialEntryUseCase: dedups on replay, conflicts on payload mismatch', async () => {
    const financialEntryRepo = {
      findById: vi.fn().mockResolvedValue(makeApprovedDebit()),
      voidEntry: vi.fn().mockResolvedValue(undefined),
    };
    const idempotencyService = new InMemoryIdempotencyService();

    const sut = new VoidFinancialEntryUseCase(financialEntryRepo as any, auditService as any, authorizationService, idempotencyService);

    const input = {
      entryId: 'debit-1',
      reason: 'Entry was created in error',
      idempotencyKey: 'dedup-key-3',
      actor: opActor,
    };

    const first = await sut.execute(input);
    const second = await sut.execute({ ...input });

    expect(financialEntryRepo.voidEntry).toHaveBeenCalledOnce();
    expect(second).toEqual(first);

    await expect(sut.execute({ ...input, reason: 'Different reason' })).rejects.toThrow(BillingIdempotencyPayloadMismatchError);
    expect(financialEntryRepo.voidEntry).toHaveBeenCalledOnce();
  });

  it('ApproveFinancialEntryUseCase: dedups on replay, conflicts on payload mismatch', async () => {
    const pendingEntry = makePendingPayout();
    const financialEntryRepo = {
      findById: vi.fn().mockResolvedValue(pendingEntry),
      transitionStatus: vi.fn().mockResolvedValue(undefined),
      findByIdEnriched: vi.fn().mockImplementation(async () => ({
        entity: new FinancialEntryEntity({ ...pendingEntry, status: 'APPROVED', approvedByUserId: 'op-1', approvedAt: new Date() }),
        appointmentCode: 'INS-2026-0001',
        relatedEntityName: 'Test Agency',
        approvedByName: 'Test Approver',
      })),
    };
    const idempotencyService = new InMemoryIdempotencyService();

    const sut = new ApproveFinancialEntryUseCase(financialEntryRepo as any, auditService as any, authorizationService, idempotencyService);

    const input = { entryId: 'entry-1', idempotencyKey: 'dedup-key-4', actor: opActor };

    const first = await sut.execute(input);
    const second = await sut.execute({ ...input });

    expect(financialEntryRepo.transitionStatus).toHaveBeenCalledOnce();
    expect(second).toEqual(first);

    await expect(
      sut.execute({ entryId: 'entry-1', idempotencyKey: 'dedup-key-4', actor: { ...opActor, userId: 'op-2' } }),
    ).rejects.toThrow(BillingIdempotencyPayloadMismatchError);
    expect(financialEntryRepo.transitionStatus).toHaveBeenCalledOnce();
  });

  it('MarkInvoicePaidUseCase: dedups on replay, conflicts on payload mismatch', async () => {
    const invoiceRepo = {
      findById: vi.fn().mockResolvedValue(makeInvoice()),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const idempotencyService = new InMemoryIdempotencyService();

    const sut = new MarkInvoicePaidUseCase(invoiceRepo as any, auditService as any, authorizationService, idempotencyService);

    const input = { invoiceId: 'inv-1', idempotencyKey: 'dedup-key-5', actor: opActor };

    const first = await sut.execute(input);
    const second = await sut.execute({ ...input });

    expect(invoiceRepo.update).toHaveBeenCalledOnce();
    expect(second).toEqual(first);

    await expect(
      sut.execute({ invoiceId: 'inv-1', paymentReference: 'DIFFERENT', idempotencyKey: 'dedup-key-5', actor: opActor }),
    ).rejects.toThrow(BillingIdempotencyPayloadMismatchError);
    expect(invoiceRepo.update).toHaveBeenCalledOnce();
  });

  it('BatchMarkInvoicesPaidUseCase: dedups on replay, conflicts on payload mismatch', async () => {
    const invoiceRepo = {
      findManyByIds: vi.fn().mockResolvedValue([makeInvoice({ id: 'inv-1' }), makeInvoice({ id: 'inv-2' })]),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const idempotencyService = new InMemoryIdempotencyService();

    const sut = new BatchMarkInvoicesPaidUseCase(invoiceRepo as any, auditService as any, authorizationService, idempotencyService);

    const input = { invoiceIds: ['inv-1', 'inv-2'], idempotencyKey: 'dedup-key-6', actor: opActor };

    const first = await sut.execute(input);
    const second = await sut.execute({ ...input });

    expect(invoiceRepo.update).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);

    await expect(
      sut.execute({ invoiceIds: ['inv-1'], idempotencyKey: 'dedup-key-6', actor: opActor }),
    ).rejects.toThrow(BillingIdempotencyPayloadMismatchError);
    expect(invoiceRepo.update).toHaveBeenCalledTimes(2);
  });

  it('ReverseInvoicePaymentUseCase: dedups on replay, conflicts on payload mismatch', async () => {
    const invoiceRepo = {
      findById: vi.fn().mockResolvedValue(
        makeInvoice({ status: 'PAID', paidAt: new Date(), paidByUserId: 'op-1', paymentReference: 'BT-001' }),
      ),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const idempotencyService = new InMemoryIdempotencyService();

    const sut = new ReverseInvoicePaymentUseCase(invoiceRepo as any, auditService as any, authorizationService, idempotencyService);

    const input = { invoiceId: 'inv-1', reason: 'Bank transfer rejected', idempotencyKey: 'dedup-key-7', actor: opActor };

    const first = await sut.execute(input);
    const second = await sut.execute({ ...input });

    expect(invoiceRepo.update).toHaveBeenCalledOnce();
    expect(second).toEqual(first);

    await expect(
      sut.execute({ invoiceId: 'inv-1', reason: 'A different reason', idempotencyKey: 'dedup-key-7', actor: opActor }),
    ).rejects.toThrow(BillingIdempotencyPayloadMismatchError);
    expect(invoiceRepo.update).toHaveBeenCalledOnce();
  });
});
