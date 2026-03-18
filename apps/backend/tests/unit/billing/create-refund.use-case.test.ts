import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateRefundUseCase } from '../../../src/modules/billing/application/use-cases/create-refund.use-case';
import { FinancialEntryEntity } from '../../../src/modules/billing/domain/financial-entry.entity';
import {
  EntryNotFoundError,
  EntryNotRefundableError,
  RefundAlreadyExistsError,
} from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

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
};

const auditService = { log: vi.fn() };

const idempotencyService = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
};

function makeApprovedDebit(overrides = {}) {
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

const opActor = {
  userId: 'op-1',
  tenantId: 'tenant-1',
  role: 'OP' as const,
  branchId: null,
  inspectorId: null,
};

const amActor = {
  userId: 'am-1',
  tenantId: null,
  role: 'AM' as const,
  branchId: null,
  inspectorId: null,
};

function makeSut() {
  return new CreateRefundUseCase(financialEntryRepo, auditService as any, idempotencyService);
}

describe('CreateRefundUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financialEntryRepo.findById.mockResolvedValue(makeApprovedDebit());
    financialEntryRepo.findByReferenceEntryIdAndType.mockResolvedValue(null);
    financialEntryRepo.save.mockResolvedValue(undefined);
    idempotencyService.get.mockResolvedValue(null);
  });

  it('should create a REFUND entry with full amount from original', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      entryId: 'debit-1',
      description: 'Service not executed',
      reason: 'Inspector did not show up',
      actor: opActor,
    });

    expect(result.id).toBeDefined();
    expect(result.entryType).toBe('REFUND');
    expect(result.amount).toBe(200);
    expect(result.currency).toBe('AUD');
    expect(result.status).toBe('PENDING');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.appointmentId).toBe('appt-1');
    expect(result.referenceEntryId).toBe('debit-1');
    expect(result.description).toBe('Service not executed');
    expect(result.reason).toBe('Inspector did not show up');
    expect(result.initiatedByUserId).toBe('op-1');
    expect(result.createdAt).toBeInstanceOf(Date);

    expect(financialEntryRepo.save).toHaveBeenCalledOnce();
    const savedEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(savedEntry.entryType).toBe('REFUND');
    expect(savedEntry.amount).toBe(200);
    expect(savedEntry.referenceEntryId).toBe('debit-1');
  });

  it('should allow AM to create refunds', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      entryId: 'debit-1',
      description: 'Refund',
      reason: 'Reason',
      actor: amActor,
    });

    expect(result.initiatedByUserId).toBe('am-1');
  });

  it('should reject if original entry is not an APPROVED TENANT_DEBIT (wrong type)', async () => {
    const sut = makeSut();
    financialEntryRepo.findById.mockResolvedValue(
      makeApprovedDebit({ entryType: 'INSPECTOR_PAYOUT' }),
    );

    await expect(
      sut.execute({
        entryId: 'debit-1',
        description: 'Refund',
        reason: 'Reason',
        actor: opActor,
      }),
    ).rejects.toThrow(EntryNotRefundableError);
  });

  it('should reject if original entry is not approved (wrong status)', async () => {
    const sut = makeSut();
    financialEntryRepo.findById.mockResolvedValue(
      makeApprovedDebit({ status: 'PENDING' }),
    );

    await expect(
      sut.execute({
        entryId: 'debit-1',
        description: 'Refund',
        reason: 'Reason',
        actor: opActor,
      }),
    ).rejects.toThrow(EntryNotRefundableError);
  });

  it('should reject if refund already exists for this entry', async () => {
    const sut = makeSut();
    const existingRefund = new FinancialEntryEntity({
      id: 'refund-existing',
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      inspectorId: null,
      entryType: 'REFUND',
      amount: 200,
      currency: 'AUD',
      status: 'PENDING',
      description: 'Existing refund',
      effectiveAt: new Date(),
      initiatedByUserId: 'op-2',
      approvedByUserId: null,
      approvedAt: null,
      referenceEntryId: 'debit-1',
      reason: 'Already refunded',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    financialEntryRepo.findByReferenceEntryIdAndType.mockResolvedValue(existingRefund);

    await expect(
      sut.execute({
        entryId: 'debit-1',
        description: 'Refund',
        reason: 'Reason',
        actor: opActor,
      }),
    ).rejects.toThrow(RefundAlreadyExistsError);
  });

  it('should reject non-AM/OP actor', async () => {
    const sut = makeSut();
    const clientActor = {
      userId: 'cl-1',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN' as const,
      branchId: null,
      inspectorId: null,
    };

    await expect(
      sut.execute({
        entryId: 'debit-1',
        description: 'Refund',
        reason: 'Reason',
        actor: clientActor,
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(financialEntryRepo.save).not.toHaveBeenCalled();
  });

  it('should reject when entry not found', async () => {
    const sut = makeSut();
    financialEntryRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({
        entryId: 'nonexistent',
        description: 'Refund',
        reason: 'Reason',
        actor: opActor,
      }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('should audit log the refund creation', async () => {
    const sut = makeSut();

    await sut.execute({
      entryId: 'debit-1',
      description: 'Service not executed',
      reason: 'Inspector did not show up',
      actor: opActor,
    });

    expect(auditService.log).toHaveBeenCalledOnce();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'financial_entry.refund_created',
        actorType: 'USER',
        actorId: 'op-1',
        entityType: 'FinancialEntry',
        tenantId: 'tenant-1',
        after: expect.objectContaining({
          entryType: 'REFUND',
          amount: 200,
          referenceEntryId: 'debit-1',
          reason: 'Inspector did not show up',
        }),
      }),
    );
  });

  it('should return cached result on duplicate call when idempotencyKey is provided', async () => {
    const cachedResult = {
      id: 'cached-id',
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      entryType: 'REFUND' as const,
      amount: 200,
      currency: 'AUD',
      status: 'PENDING' as const,
      description: 'Cached refund',
      reason: 'Cached reason',
      referenceEntryId: 'debit-1',
      initiatedByUserId: 'op-1',
      createdAt: new Date(),
    };
    idempotencyService.get.mockResolvedValue(cachedResult);

    const sut = makeSut();
    const result = await sut.execute({
      entryId: 'debit-1',
      description: 'Service not executed',
      reason: 'Inspector did not show up',
      idempotencyKey: 'refund-idem-key',
      actor: opActor,
    });

    expect(result).toEqual(cachedResult);
    expect(financialEntryRepo.save).not.toHaveBeenCalled();
    expect(idempotencyService.get).toHaveBeenCalledWith('refund-idem-key', 'refund');
  });

  it('should cache result after successful refund when idempotencyKey is provided', async () => {
    const sut = makeSut();

    await sut.execute({
      entryId: 'debit-1',
      description: 'Service not executed',
      reason: 'Inspector did not show up',
      idempotencyKey: 'refund-idem-key',
      actor: opActor,
    });

    expect(idempotencyService.set).toHaveBeenCalledWith(
      'refund-idem-key',
      'refund',
      expect.objectContaining({
        entryType: 'REFUND',
        amount: 200,
      }),
      24,
    );
  });

  it('should not check idempotency when idempotencyKey is not provided', async () => {
    const sut = makeSut();

    await sut.execute({
      entryId: 'debit-1',
      description: 'Service not executed',
      reason: 'Inspector did not show up',
      actor: opActor,
    });

    expect(idempotencyService.get).not.toHaveBeenCalled();
    expect(idempotencyService.set).not.toHaveBeenCalled();
  });
});
