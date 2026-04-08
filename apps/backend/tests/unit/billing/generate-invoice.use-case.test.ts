import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateInvoiceUseCase, parseDateInTimezone } from '../../../src/modules/billing/application/use-cases/generate-invoice.use-case';
import type { IInspectorInvoiceRepository } from '../../../src/modules/billing/domain/inspector-invoice.repository';
import type { IFinancialEntryRepository } from '../../../src/modules/billing/domain/financial-entry.repository';
import { InspectorInvoiceEntity, type InspectorInvoiceProps } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import { InvoicePeriodOverlapError } from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { AuthContext } from '@properfy/shared';

function makeInvoice(overrides: Partial<InspectorInvoiceProps> = {}): InspectorInvoiceEntity {
  const now = new Date();
  return new InspectorInvoiceEntity({
    id: 'invoice-1',
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'BIWEEKLY',
    status: 'CLOSED',
    totalAmount: 1400,
    currency: 'AUD',
    fileKey: null,
    previousInvoiceId: null,
    generatedByUserId: 'user-am',
    generatedAt: now,
    paidAt: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeTenantRepo(timezone = 'UTC') {
  return {
    findById: vi.fn().mockResolvedValue({
      id: 'tenant-1',
      timezone,
      currency: 'AUD',
      isActive: () => true,
    }),
    findByLegalName: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  } as unknown as ITenantRepository;
}

function makeSut(tenantRepo?: ITenantRepository) {
  const invoiceRepo: IInspectorInvoiceRepository = {
    findById: vi.fn(),
    findByInspectorAndPeriod: vi.fn(),
    findOverlapping: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  const financialEntryRepo = {
    findById: vi.fn(),
    findByAppointmentAndType: vi.fn(),
    findByReferenceEntryIdAndType: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    updateStatus: vi.fn(),
    transitionStatus: vi.fn(),
    sumApprovedPayoutsForInspectorInPeriod: vi.fn(),
    sumRefundsByReferenceEntryId: vi.fn(),
  } as unknown as IFinancialEntryRepository;

  const auditService = {
    log: vi.fn(),
  } as unknown as AuditService;

  const useCase = new GenerateInvoiceUseCase(
    invoiceRepo, financialEntryRepo, auditService, undefined, tenantRepo,
  );

  return { useCase, invoiceRepo, financialEntryRepo, auditService };
}

describe('GenerateInvoiceUseCase', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('should create invoice with CLOSED status and correct totalAmount', async () => {
    const { useCase, invoiceRepo, financialEntryRepo, auditService } = sut;

    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(null);
    vi.mocked(invoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(2500);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);

    const result = await useCase.execute({
      inspectorId: 'insp-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-15',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.status).toBe('CLOSED');
    expect(result.totalAmount).toBe(2500);
    expect(result.currency).toBe('AUD');
    expect(result.id).toBeDefined();
    expect(result.inspectorId).toBe('insp-1');
    expect(result.periodType).toBe('BIWEEKLY');
    expect(result.fileKey).toBeNull();

    expect(invoiceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectorId: 'insp-1',
        status: 'CLOSED',
        totalAmount: 2500,
        currency: 'AUD',
        periodType: 'BIWEEKLY',
      }),
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoice.generated',
        entityType: 'InspectorInvoice',
      }),
    );
  });

  it('should return existing invoice if same inspector+period (idempotent)', async () => {
    const { useCase, invoiceRepo, financialEntryRepo } = sut;

    const existing = makeInvoice({ id: 'existing-inv', totalAmount: 1400, currency: 'AUD' });
    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(existing);

    const result = await useCase.execute({
      inspectorId: 'insp-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-15',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.id).toBe('existing-inv');
    expect(result.totalAmount).toBe(1400);
    expect(result.status).toBe('CLOSED');
    expect(result.periodStart).toBe('2026-03-01');
    expect(result.periodEnd).toBe('2026-03-15');
    expect(invoiceRepo.save).not.toHaveBeenCalled();
    expect(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).not.toHaveBeenCalled();
  });

  it('should reflect the actual status of an existing invoice', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(
      makeInvoice({ id: 'existing-paid', status: 'PAID', paidAt: new Date('2026-03-20T10:00:00.000Z') }),
    );

    const result = await useCase.execute({
      inspectorId: 'insp-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-15',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.id).toBe('existing-paid');
    expect(result.status).toBe('PAID');
    expect(result.paidAt).toBe('2026-03-20T10:00:00.000Z');
  });

  it('should reject overlapping period', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(null);
    vi.mocked(invoiceRepo.findOverlapping).mockResolvedValue(makeInvoice());

    await expect(
      useCase.execute({
        inspectorId: 'insp-1',
        periodStart: '2026-03-05',
        periodEnd: '2026-03-20',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(InvoicePeriodOverlapError);
  });

  it('should reject non-AM/OP actor', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        inspectorId: 'insp-1',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      useCase.execute({
        inspectorId: 'insp-1',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should handle zero total amount', async () => {
    const { useCase, invoiceRepo, financialEntryRepo } = sut;

    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(null);
    vi.mocked(invoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(0);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);

    const result = await useCase.execute({
      inspectorId: 'insp-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-15',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.totalAmount).toBe(0);
    expect(result.status).toBe('CLOSED');
    expect(invoiceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ totalAmount: 0 }),
    );
  });

  it('should use provided periodType and currency', async () => {
    const { useCase, invoiceRepo, financialEntryRepo } = sut;
    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(null);
    vi.mocked(invoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(1000);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);

    const result = await useCase.execute({
      inspectorId: 'insp-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      periodType: 'MONTHLY',
      currency: 'NZD',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.currency).toBe('NZD');
    expect(result.periodType).toBe('MONTHLY');
    expect(invoiceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ periodType: 'MONTHLY', currency: 'NZD' }),
    );
  });

  it('should include the full final day when summing approved payouts', async () => {
    const { useCase, invoiceRepo, financialEntryRepo } = sut;

    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(null);
    vi.mocked(invoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(1000);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);

    await useCase.execute({
      inspectorId: 'insp-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-15',
      actor: makeActor({ role: 'AM' }),
    });

    expect(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).toHaveBeenCalledWith(
      'insp-1',
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-15T23:59:59.999Z'),
    );
  });

  it('should allow OP role to generate invoices', async () => {
    const { useCase, invoiceRepo, financialEntryRepo } = sut;

    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(null);
    vi.mocked(invoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(500);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);

    const result = await useCase.execute({
      inspectorId: 'insp-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-15',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.status).toBe('CLOSED');
    expect(invoiceRepo.save).toHaveBeenCalled();
  });
});

// =============================================================================
// GAP-005: Tenant-timezone period boundaries
// =============================================================================

describe('parseDateInTimezone', () => {
  it('should return UTC midnight for UTC timezone', () => {
    const result = parseDateInTimezone('2026-03-15', 'UTC');
    expect(result.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('should return correct UTC time for Australia/Sydney (AEDT, UTC+11)', () => {
    // 2026-03-15 in Sydney is AEDT (UTC+11), so midnight Sydney = 13:00 UTC previous day
    const result = parseDateInTimezone('2026-03-15', 'Australia/Sydney');
    expect(result.toISOString()).toBe('2026-03-14T13:00:00.000Z');
  });

  it('should return correct UTC time for Australia/Sydney (AEST, UTC+10)', () => {
    // 2026-06-15 in Sydney is AEST (UTC+10), so midnight Sydney = 14:00 UTC previous day
    const result = parseDateInTimezone('2026-06-15', 'Australia/Sydney');
    expect(result.toISOString()).toBe('2026-06-14T14:00:00.000Z');
  });

  it('should handle Sydney timezone Saturday UTC = Sunday local boundary shift', () => {
    // Saturday 2026-04-04 23:00 UTC = Sunday 2026-04-05 09:00 AEST
    // So if we ask for period starting on 2026-04-05 in Sydney, it should map to
    // 2026-04-04T14:00:00.000Z (midnight AEST = UTC+10 in April which is AEST)
    const result = parseDateInTimezone('2026-04-05', 'Australia/Sydney');
    expect(result.toISOString()).toBe('2026-04-04T14:00:00.000Z');
  });

  it('should handle America/Sao_Paulo timezone (UTC-3)', () => {
    // 2026-03-15 midnight in Sao Paulo (UTC-3) = 2026-03-15T03:00:00.000Z
    const result = parseDateInTimezone('2026-03-15', 'America/Sao_Paulo');
    expect(result.toISOString()).toBe('2026-03-15T03:00:00.000Z');
  });

  it('should handle America/New_York timezone (EDT, UTC-4)', () => {
    // 2026-06-15 midnight in New York (EDT, UTC-4) = 2026-06-15T04:00:00.000Z
    const result = parseDateInTimezone('2026-06-15', 'America/New_York');
    expect(result.toISOString()).toBe('2026-06-15T04:00:00.000Z');
  });
});

describe('GenerateInvoiceUseCase – timezone-aware boundaries', () => {
  it('should use tenant timezone for period boundaries when tenantId is provided', async () => {
    const tenantRepo = makeTenantRepo('Australia/Sydney');
    const { useCase, invoiceRepo, financialEntryRepo } = makeSut(tenantRepo);

    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(null);
    vi.mocked(invoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(1000);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);

    await useCase.execute({
      inspectorId: 'insp-1',
      tenantId: 'tenant-1',
      periodStart: '2026-04-05',
      periodEnd: '2026-04-19',
      actor: makeActor({ role: 'AM' }),
    });

    // April in Sydney is AEST (UTC+10)
    // periodStart: 2026-04-05 midnight AEST = 2026-04-04T14:00:00.000Z
    const callArgs = vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mock.calls[0];
    const startDate = callArgs[1] as Date;
    const endDate = callArgs[2] as Date;

    expect(startDate.toISOString()).toBe('2026-04-04T14:00:00.000Z');
    // endDate should be start of 2026-04-19 AEST + 23:59:59.999
    expect(endDate.toISOString()).toBe('2026-04-19T13:59:59.999Z');
  });

  it('should fall back to UTC when no tenantId and no tenant repo', async () => {
    const { useCase, invoiceRepo, financialEntryRepo } = makeSut();

    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(null);
    vi.mocked(invoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(500);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);

    await useCase.execute({
      inspectorId: 'insp-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-15',
      actor: makeActor({ role: 'AM' }),
    });

    const callArgs = vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mock.calls[0];
    expect((callArgs[1] as Date).toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect((callArgs[2] as Date).toISOString()).toBe('2026-03-15T23:59:59.999Z');
  });

  it('should use actor tenantId when input tenantId is not provided', async () => {
    const tenantRepo = makeTenantRepo('America/Sao_Paulo');
    const { useCase, invoiceRepo, financialEntryRepo } = makeSut(tenantRepo);

    vi.mocked(invoiceRepo.findByInspectorAndPeriod).mockResolvedValue(null);
    vi.mocked(invoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(500);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);

    await useCase.execute({
      inspectorId: 'insp-1',
      periodStart: '2026-03-15',
      periodEnd: '2026-03-31',
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    // Sao Paulo is UTC-3, so midnight Sao Paulo = 03:00 UTC
    const callArgs = vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mock.calls[0];
    expect((callArgs[1] as Date).toISOString()).toBe('2026-03-15T03:00:00.000Z');
  });
});
