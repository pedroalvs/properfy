import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkInvoicePaidUseCase } from '../../../src/modules/billing/application/use-cases/mark-invoice-paid.use-case';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import { InvoicePaymentDateInvalidError } from '../../../src/modules/billing/domain/billing.errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { FakeClock } from '../../helpers/fake-clock';

/**
 * Frozen-clock edge coverage for the payment-date validation. Locks "now"
 * to a specific instant so we can assert the exact boundary of the 1h future
 * grace and the 60s past-generated grace that mitigate client-side
 * datetime-local truncation (B-7 shape).
 */
describe('MarkInvoicePaidUseCase — frozen clock grace windows', () => {
  const opActor = {
    userId: 'op-1',
    tenantId: 'tenant-1',
    role: 'OP' as const,
    branchId: null,
    inspectorId: null,
  };

  function makeInvoice(overrides: Record<string, unknown> = {}) {
    return new InspectorInvoiceEntity({
      id: 'inv-1',
      inspectorId: 'insp-1',
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-15'),
      periodType: 'BIWEEKLY',
      status: 'CLOSED',
      totalAmount: 1200,
      currency: 'AUD',
      fileKey: 'invoices/inv-1.xlsx',
      previousInvoiceId: null,
      generatedByUserId: 'op-1',
      generatedAt: new Date('2026-06-15T12:00:00.000Z'),
      paidAt: null,
      paidByUserId: null,
      paymentReference: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
  }

  let invoiceRepo: {
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  const auditService = { log: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    invoiceRepo = {
      findById: vi.fn().mockResolvedValue(makeInvoice()),
      update: vi.fn().mockResolvedValue(undefined),
    };
  });

  function buildUseCase(clock: FakeClock): MarkInvoicePaidUseCase {
    return new MarkInvoicePaidUseCase(
      invoiceRepo as any,
      auditService as any,
      new AuthorizationService(auditService as any),
      clock,
    );
  }

  it('accepts paidAt exactly 59 minutes in the future from frozen now', async () => {
    const clock = new FakeClock(new Date('2026-06-15T15:00:00.000Z'));
    const uc = buildUseCase(clock);
    // 59 min ahead of frozen now — inside the 1h future grace.
    const result = await uc.execute({
      invoiceId: 'inv-1',
      paidAt: '2026-06-15T15:59:00.000Z',
      actor: opActor,
    });
    expect(result.status).toBe('PAID');
  });

  it('rejects paidAt 2h in the future — outside the 1h future grace', async () => {
    const clock = new FakeClock(new Date('2026-06-15T15:00:00.000Z'));
    const uc = buildUseCase(clock);
    await expect(
      uc.execute({
        invoiceId: 'inv-1',
        paidAt: '2026-06-15T17:00:01.000Z',
        actor: opActor,
      }),
    ).rejects.toBeInstanceOf(InvoicePaymentDateInvalidError);
  });

  it('accepts paidAt truncated to the minute even when generatedAt has subsecond precision (B-7 shape)', async () => {
    // generatedAt is 2026-06-15T12:00:15.500Z — typical DB timestamp with ms.
    // Client sends paidAt truncated to the minute: 2026-06-15T12:00:00Z. That
    // is 15.5 seconds BEFORE generatedAt, well inside the 60s BEFORE_GENERATED grace.
    invoiceRepo.findById.mockResolvedValue(
      makeInvoice({ generatedAt: new Date('2026-06-15T12:00:15.500Z') }),
    );
    const clock = new FakeClock(new Date('2026-06-15T12:01:00.000Z'));
    const uc = buildUseCase(clock);

    const result = await uc.execute({
      invoiceId: 'inv-1',
      paidAt: '2026-06-15T12:00:00.000Z',
      actor: opActor,
    });
    expect(result.status).toBe('PAID');
  });

  it('rejects paidAt 90s before generatedAt — outside the 60s BEFORE_GENERATED grace', async () => {
    invoiceRepo.findById.mockResolvedValue(
      makeInvoice({ generatedAt: new Date('2026-06-15T12:00:00.000Z') }),
    );
    const clock = new FakeClock(new Date('2026-06-15T12:05:00.000Z'));
    const uc = buildUseCase(clock);

    await expect(
      uc.execute({
        invoiceId: 'inv-1',
        paidAt: '2026-06-15T11:58:30.000Z',
        actor: opActor,
      }),
    ).rejects.toBeInstanceOf(InvoicePaymentDateInvalidError);
  });
});
