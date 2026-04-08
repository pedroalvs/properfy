import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegenerateTenantInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/regenerate-tenant-invoice.use-case';
import type { ITenantInvoiceRepository } from '../../../src/modules/billing/domain/tenant-invoice.repository';
import type { IFinancialEntryRepository } from '../../../src/modules/billing/domain/financial-entry.repository';
import { TenantInvoiceEntity, type TenantInvoiceProps } from '../../../src/modules/billing/domain/tenant-invoice.entity';
import { TenantInvoiceNotFoundError, TenantInvoiceNotRegenerableError } from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
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

  const useCase = new RegenerateTenantInvoiceUseCase(
    tenantInvoiceRepo,
    financialEntryRepo,
    auditService,
    jobQueue,
  );

  return { useCase, tenantInvoiceRepo, financialEntryRepo, auditService, jobQueue };
}

describe('RegenerateTenantInvoiceUseCase', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('should regenerate a CLOSED tenant invoice with revised totals', async () => {
    const { useCase, tenantInvoiceRepo, financialEntryRepo, auditService, jobQueue } = sut;

    vi.mocked(tenantInvoiceRepo.findById).mockResolvedValue(
      makeInvoice({ status: 'CLOSED', netAmount: 4700 }),
    );
    vi.mocked(financialEntryRepo.sumApprovedEntriesForTenantInPeriod).mockResolvedValue({
      totalDebit: 4000,
      totalRefund: 300,
      totalAdjustment: 100,
    });
    vi.mocked(tenantInvoiceRepo.save).mockResolvedValue(undefined);
    vi.mocked(tenantInvoiceRepo.update).mockResolvedValue(undefined);

    const result = await useCase.execute({
      invoiceId: 'tenant-inv-1',
      reason: 'Voided entry, recalculating',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.status).toBe('CLOSED');
    expect(result.totalDebit).toBe(4000);
    expect(result.totalRefund).toBe(300);
    expect(result.totalAdjustment).toBe(100);
    expect(result.netAmount).toBe(3800); // 4000 - 300 + 100
    expect(result.previousInvoiceId).toBe('tenant-inv-1');
    expect(result.id).not.toBe('tenant-inv-1');

    // Old invoice marked as SUPERSEDED
    expect(tenantInvoiceRepo.update).toHaveBeenCalledWith('tenant-inv-1', { status: 'SUPERSEDED' });

    // New invoice saved
    expect(tenantInvoiceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        status: 'CLOSED',
        netAmount: 3800,
        previousInvoiceId: 'tenant-inv-1',
      }),
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant_invoice.regenerated',
        entityType: 'TenantInvoice',
        tenantId: 'tenant-1',
      }),
    );

    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'billing.generate-tenant-invoice-file',
      expect.objectContaining({ invoiceId: result.id }),
    );
  });

  it('should maintain version chain (previousInvoiceId)', async () => {
    const { useCase, tenantInvoiceRepo, financialEntryRepo } = sut;

    vi.mocked(tenantInvoiceRepo.findById).mockResolvedValue(
      makeInvoice({ id: 'inv-v1', status: 'PAID' }),
    );
    vi.mocked(financialEntryRepo.sumApprovedEntriesForTenantInPeriod).mockResolvedValue({
      totalDebit: 2000,
      totalRefund: 0,
      totalAdjustment: 0,
    });
    vi.mocked(tenantInvoiceRepo.save).mockResolvedValue(undefined);
    vi.mocked(tenantInvoiceRepo.update).mockResolvedValue(undefined);

    const result = await useCase.execute({
      invoiceId: 'inv-v1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.previousInvoiceId).toBe('inv-v1');
    expect(tenantInvoiceRepo.update).toHaveBeenCalledWith('inv-v1', { status: 'SUPERSEDED' });
  });

  it('should reject OPEN tenant invoice (not regenerable)', async () => {
    const { useCase, tenantInvoiceRepo } = sut;

    vi.mocked(tenantInvoiceRepo.findById).mockResolvedValue(
      makeInvoice({ status: 'OPEN' }),
    );

    await expect(
      useCase.execute({
        invoiceId: 'tenant-inv-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(TenantInvoiceNotRegenerableError);
  });

  it('should reject SUPERSEDED tenant invoice (not regenerable)', async () => {
    const { useCase, tenantInvoiceRepo } = sut;

    vi.mocked(tenantInvoiceRepo.findById).mockResolvedValue(
      makeInvoice({ status: 'SUPERSEDED' }),
    );

    await expect(
      useCase.execute({
        invoiceId: 'tenant-inv-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(TenantInvoiceNotRegenerableError);
  });

  it('should reject non-existent invoice', async () => {
    const { useCase, tenantInvoiceRepo } = sut;

    vi.mocked(tenantInvoiceRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        invoiceId: 'non-existent',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(TenantInvoiceNotFoundError);
  });

  it('should reject non-AM actor (OP forbidden)', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        invoiceId: 'tenant-inv-1',
        actor: makeActor({ role: 'OP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
