import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CancelFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/cancel-financial-entry.use-case';
import { FinancialEntryEntity } from '../../../src/modules/billing/domain/financial-entry.entity';
import {
  EntryNotFoundError,
  EntryNotPendingError,
} from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const financialEntryRepo = {
  findById: vi.fn(),
  findByIdEnriched: vi.fn(),
  findByAppointmentAndType: vi.fn(),
  findByReferenceEntryIdAndType: vi.fn(),
  findAll: vi.fn(),
  findAllEnriched: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  updateStatus: vi.fn(),
  transitionStatus: vi.fn(),
  sumApprovedPayoutsForInspectorInPeriod: vi.fn(),
  getSummary: vi.fn(),
};

const auditService = { log: vi.fn() };

function makePendingEntry(overrides = {}) {
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
  return new CancelFinancialEntryUseCase(financialEntryRepo, auditService as any);
}

describe('CancelFinancialEntryUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financialEntryRepo.findById.mockResolvedValue(makePendingEntry());
    financialEntryRepo.transitionStatus.mockResolvedValue(undefined);
  });

  it('should set status to CANCELLED for PENDING entry when OP cancels', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      entryId: 'entry-1',
      reason: 'Duplicate entry',
      actor: opActor,
    });

    expect(result.id).toBe('entry-1');
    expect(result.status).toBe('CANCELLED');
    expect(result.cancelledBy).toBe('op-1');
    expect(result.cancelledAt).toBeInstanceOf(Date);

    expect(financialEntryRepo.transitionStatus).toHaveBeenCalledWith(
      'entry-1',
      'tenant-1',
      'PENDING',
      'CANCELLED',
    );
  });

  it('should allow AM to cancel entries', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      entryId: 'entry-1',
      reason: 'Wrong amount',
      actor: amActor,
    });

    expect(result.status).toBe('CANCELLED');
    expect(result.cancelledBy).toBe('am-1');
  });

  it('should reject cancellation of APPROVED entry', async () => {
    const sut = makeSut();
    financialEntryRepo.findById.mockResolvedValue(
      makePendingEntry({ status: 'APPROVED' }),
    );

    await expect(
      sut.execute({ entryId: 'entry-1', reason: 'Too late', actor: opActor }),
    ).rejects.toThrow(EntryNotPendingError);
  });

  it('should reject cancellation of already CANCELLED entry', async () => {
    const sut = makeSut();
    financialEntryRepo.findById.mockResolvedValue(
      makePendingEntry({ status: 'CANCELLED' }),
    );

    await expect(
      sut.execute({ entryId: 'entry-1', reason: 'Again', actor: opActor }),
    ).rejects.toThrow(EntryNotPendingError);
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
      sut.execute({ entryId: 'entry-1', reason: 'No access', actor: clientActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP actor', async () => {
    const sut = makeSut();
    const inspActor = {
      userId: 'insp-1',
      tenantId: 'tenant-1',
      role: 'INSP' as const,
      branchId: null,
      inspectorId: 'insp-1',
    };

    await expect(
      sut.execute({ entryId: 'entry-1', reason: 'No access', actor: inspActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject when entry not found', async () => {
    const sut = makeSut();
    financialEntryRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ entryId: 'nonexistent', reason: 'Gone', actor: opActor }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('should audit log the cancellation with reason', async () => {
    const sut = makeSut();

    await sut.execute({
      entryId: 'entry-1',
      reason: 'Duplicate entry created by mistake',
      actor: opActor,
    });

    expect(auditService.log).toHaveBeenCalledOnce();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'financial_entry.cancelled',
        actorType: 'USER',
        actorId: 'op-1',
        entityType: 'FinancialEntry',
        entityId: 'entry-1',
        tenantId: 'tenant-1',
        reason: 'Duplicate entry created by mistake',
        before: { status: 'PENDING' },
        after: expect.objectContaining({ status: 'CANCELLED', cancelledBy: 'op-1' }),
      }),
    );
  });
});
