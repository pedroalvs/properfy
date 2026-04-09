import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateTenantInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/generate-tenant-invoice.use-case';
import type { ITenantInvoiceRepository } from '../../../src/modules/billing/domain/tenant-invoice.repository';
import type { IFinancialEntryRepository } from '../../../src/modules/billing/domain/financial-entry.repository';
import { TenantInvoiceEntity, type TenantInvoiceProps } from '../../../src/modules/billing/domain/tenant-invoice.entity';
import { TenantInvoicePeriodOverlapError } from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

function makeInvoice(overrides: Partial<TenantInvoiceProps> = {}): TenantInvoiceEntity {
  const now = new Date();
  return new TenantInvoiceEntity({
    id: 'tenant-inv-1',
    tenantId: 'tenant-1',
    periodFrom: new Date('2026-03-01'),
    periodTo: new Date('2026-03-31'),
    totalDebit: 5000,
    totalRefund: 500,
    totalAdjustment: 200,
    netAmount: 4700,
    currency: 'AUD',
    status: 'CLOSED',
    fileKey: null,
    previousInvoiceId: null,
    generatedByUserId: 'user-am',
    generatedAt: now,
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

function makeSut() {
  const tenantInvoiceRepo: ITenantInvoiceRepository = {
    findById: vi.fn(),
    findByTenantAndPeriod: vi.fn(),
    findOverlapping: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

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
    sumRefundsByReferenceEntryId: vi.fn(),
    sumApprovedEntriesForTenantInPeriod: vi.fn(),
    voidEntry: vi.fn(),
  } as unknown as IFinancialEntryRepository;

  const auditService = {
    log: vi.fn(),
  } as unknown as AuditService;

  const jobQueue = {
    enqueue: vi.fn(),
  };

  const authorizationService = new AuthorizationService(auditService);
  const useCase = new GenerateTenantInvoiceUseCase(
    tenantInvoiceRepo,
    financialEntryRepo,
    auditService,
    jobQueue,
    authorizationService,
  );

  return { useCase, tenantInvoiceRepo, financialEntryRepo, auditService, jobQueue };
}

describe('GenerateTenantInvoiceUseCase', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('should generate tenant invoice with correct totals', async () => {
    const { useCase, tenantInvoiceRepo, financialEntryRepo, auditService, jobQueue } = sut;

    vi.mocked(tenantInvoiceRepo.findByTenantAndPeriod).mockResolvedValue(null);
    vi.mocked(tenantInvoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedEntriesForTenantInPeriod).mockResolvedValue({
      totalDebit: 5000,
      totalRefund: 500,
      totalAdjustment: 200,
    });
    vi.mocked(tenantInvoiceRepo.save).mockResolvedValue(undefined);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      periodFrom: '2026-03-01',
      periodTo: '2026-03-31',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.status).toBe('CLOSED');
    expect(result.totalDebit).toBe(5000);
    expect(result.totalRefund).toBe(500);
    expect(result.totalAdjustment).toBe(200);
    expect(result.netAmount).toBe(4700); // 5000 - 500 + 200
    expect(result.currency).toBe('AUD');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.id).toBeDefined();

    expect(tenantInvoiceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        status: 'CLOSED',
        netAmount: 4700,
      }),
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant_invoice.generated',
        entityType: 'TenantInvoice',
        tenantId: 'tenant-1',
      }),
    );

    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'billing.generate-tenant-invoice-file',
      expect.objectContaining({ invoiceId: result.id }),
    );
  });

  it('should return existing invoice if same tenant+period (idempotent)', async () => {
    const { useCase, tenantInvoiceRepo, financialEntryRepo } = sut;

    const existing = makeInvoice({ id: 'existing-inv' });
    vi.mocked(tenantInvoiceRepo.findByTenantAndPeriod).mockResolvedValue(existing);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      periodFrom: '2026-03-01',
      periodTo: '2026-03-31',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.id).toBe('existing-inv');
    expect(tenantInvoiceRepo.save).not.toHaveBeenCalled();
    expect(financialEntryRepo.sumApprovedEntriesForTenantInPeriod).not.toHaveBeenCalled();
  });

  it('should reject overlapping period', async () => {
    const { useCase, tenantInvoiceRepo } = sut;

    vi.mocked(tenantInvoiceRepo.findByTenantAndPeriod).mockResolvedValue(null);
    vi.mocked(tenantInvoiceRepo.findOverlapping).mockResolvedValue(makeInvoice());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        periodFrom: '2026-03-05',
        periodTo: '2026-04-05',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(TenantInvoicePeriodOverlapError);
  });

  it('should reject non-AM/OP actor', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        periodFrom: '2026-03-01',
        periodTo: '2026-03-31',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        periodFrom: '2026-03-01',
        periodTo: '2026-03-31',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should handle empty period (zero totals)', async () => {
    const { useCase, tenantInvoiceRepo, financialEntryRepo } = sut;

    vi.mocked(tenantInvoiceRepo.findByTenantAndPeriod).mockResolvedValue(null);
    vi.mocked(tenantInvoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedEntriesForTenantInPeriod).mockResolvedValue({
      totalDebit: 0,
      totalRefund: 0,
      totalAdjustment: 0,
    });
    vi.mocked(tenantInvoiceRepo.save).mockResolvedValue(undefined);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      periodFrom: '2026-03-01',
      periodTo: '2026-03-31',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.netAmount).toBe(0);
    expect(result.totalDebit).toBe(0);
    expect(result.totalRefund).toBe(0);
    expect(result.totalAdjustment).toBe(0);
    expect(result.status).toBe('CLOSED');
  });

  it('should allow OP role to generate tenant invoices', async () => {
    const { useCase, tenantInvoiceRepo, financialEntryRepo } = sut;

    vi.mocked(tenantInvoiceRepo.findByTenantAndPeriod).mockResolvedValue(null);
    vi.mocked(tenantInvoiceRepo.findOverlapping).mockResolvedValue(null);
    vi.mocked(financialEntryRepo.sumApprovedEntriesForTenantInPeriod).mockResolvedValue({
      totalDebit: 1000,
      totalRefund: 0,
      totalAdjustment: 0,
    });
    vi.mocked(tenantInvoiceRepo.save).mockResolvedValue(undefined);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      periodFrom: '2026-03-01',
      periodTo: '2026-03-31',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.status).toBe('CLOSED');
    expect(tenantInvoiceRepo.save).toHaveBeenCalled();
  });
});
