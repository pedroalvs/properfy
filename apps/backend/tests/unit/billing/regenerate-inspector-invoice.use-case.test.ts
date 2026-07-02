import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegenerateInspectorInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/regenerate-inspector-invoice.use-case';
import type { IInspectorInvoiceRepository } from '../../../src/modules/billing/domain/inspector-invoice.repository';
import type { IFinancialEntryRepository } from '../../../src/modules/billing/domain/financial-entry.repository';
import { InspectorInvoiceEntity, type InspectorInvoiceProps } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import { InvoiceNotFoundError, InvoiceNotRegenerableError } from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

function makeInvoice(overrides: Partial<InspectorInvoiceProps> = {}): InspectorInvoiceEntity {
  const now = new Date();
  return new InspectorInvoiceEntity({
    id: 'invoice-1',
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'FORTNIGHTLY',
    status: 'CLOSED',
    totalAmount: 1400,
    currency: 'AUD',
    fileKey: null,
    previousInvoiceId: null,
    generatedByUserId: 'user-am',
    issuedAt: now,
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

function makeSut() {
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
  const useCase = new RegenerateInspectorInvoiceUseCase(
    invoiceRepo,
    financialEntryRepo,
    auditService,
    jobQueue,
    authorizationService,
  );

  return { useCase, invoiceRepo, financialEntryRepo, auditService, jobQueue };
}

describe('RegenerateInspectorInvoiceUseCase', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('should regenerate a CLOSED invoice with revised totals', async () => {
    const { useCase, invoiceRepo, financialEntryRepo, auditService, jobQueue } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice({ status: 'CLOSED', totalAmount: 1400 }));
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(1800);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);
    vi.mocked(invoiceRepo.update).mockResolvedValue(undefined);

    const result = await useCase.execute({
      invoiceId: 'invoice-1',
      reason: 'Voided entry, recalculating',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.status).toBe('CLOSED');
    expect(result.totalAmount).toBe(1800);
    expect(result.previousInvoiceId).toBe('invoice-1');
    expect(result.id).not.toBe('invoice-1'); // New ID

    // Old invoice marked as SUPERSEDED
    expect(invoiceRepo.update).toHaveBeenCalledWith('invoice-1', { status: 'SUPERSEDED' });

    // New invoice saved
    expect(invoiceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectorId: 'insp-1',
        status: 'CLOSED',
        totalAmount: 1800,
      }),
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoice.regenerated',
        entityType: 'InspectorInvoice',
      }),
    );

    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'billing.generate-invoice-file',
      expect.objectContaining({ invoiceId: result.id }),
    );
  });

  it('should regenerate a PAID invoice', async () => {
    const { useCase, invoiceRepo, financialEntryRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(
      makeInvoice({ status: 'PAID', paidAt: new Date() }),
    );
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(900);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);
    vi.mocked(invoiceRepo.update).mockResolvedValue(undefined);

    const result = await useCase.execute({
      invoiceId: 'invoice-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.status).toBe('CLOSED');
    expect(result.totalAmount).toBe(900);
    expect(result.previousInvoiceId).toBe('invoice-1');
  });

  it('should maintain version chain (previousInvoiceId)', async () => {
    const { useCase, invoiceRepo, financialEntryRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice({ id: 'inv-v1', status: 'CLOSED' }));
    vi.mocked(financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod).mockResolvedValue(500);
    vi.mocked(invoiceRepo.save).mockResolvedValue(undefined);
    vi.mocked(invoiceRepo.update).mockResolvedValue(undefined);

    const result = await useCase.execute({
      invoiceId: 'inv-v1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.previousInvoiceId).toBe('inv-v1');
    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-v1', { status: 'SUPERSEDED' });
  });

  it('should reject OPEN invoice (not regenerable)', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice({ status: 'OPEN' }));

    await expect(
      useCase.execute({
        invoiceId: 'invoice-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(InvoiceNotRegenerableError);
  });

  it('should reject non-existent invoice', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        invoiceId: 'non-existent',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it('should reject non-AM actor', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        invoiceId: 'invoice-1',
        actor: makeActor({ role: 'OP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
