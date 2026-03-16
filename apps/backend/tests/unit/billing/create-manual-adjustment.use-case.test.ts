import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateManualAdjustmentUseCase } from '../../../src/modules/billing/application/use-cases/create-manual-adjustment.use-case';
import { FinancialEntryEntity } from '../../../src/modules/billing/domain/financial-entry.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const financialEntryRepo = {
  findById: vi.fn(),
  findByAppointmentAndType: vi.fn(),
  findByReferenceEntryIdAndType: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  updateStatus: vi.fn(),
  sumApprovedPayoutsForInspectorInPeriod: vi.fn(),
};

const auditService = { log: vi.fn() };

const opActor = {
  userId: 'op-1',
  tenantId: 'tenant-1',
  role: 'OP' as const,
  branchId: null,
};

const amActor = {
  userId: 'am-1',
  tenantId: null,
  role: 'AM' as const,
  branchId: null,
};

function makeSut() {
  return new CreateManualAdjustmentUseCase(financialEntryRepo, auditService as any);
}

describe('CreateManualAdjustmentUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financialEntryRepo.save.mockResolvedValue(undefined);
  });

  it('should create a MANUAL_ADJUSTMENT entry with PENDING status', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      inspectorId: 'insp-1',
      amount: 50,
      description: 'Late fee adjustment',
      reason: 'Inspector arrived late',
      actor: opActor,
    });

    expect(result.id).toBeDefined();
    expect(result.entryType).toBe('MANUAL_ADJUSTMENT');
    expect(result.status).toBe('PENDING');
    expect(result.amount).toBe(50);
    expect(result.currency).toBe('AUD');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.appointmentId).toBe('appt-1');
    expect(result.inspectorId).toBe('insp-1');
    expect(result.description).toBe('Late fee adjustment');
    expect(result.reason).toBe('Inspector arrived late');
    expect(result.initiatedByUserId).toBe('op-1');
    expect(result.createdAt).toBeInstanceOf(Date);

    expect(financialEntryRepo.save).toHaveBeenCalledOnce();
    const savedEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(savedEntry.entryType).toBe('MANUAL_ADJUSTMENT');
    expect(savedEntry.status).toBe('PENDING');
  });

  it('should use actor.userId as initiator', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      tenantId: 'tenant-1',
      amount: 100,
      description: 'Correction',
      reason: 'Pricing error',
      actor: amActor,
    });

    expect(result.initiatedByUserId).toBe('am-1');
    const savedEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(savedEntry.initiatedByUserId).toBe('am-1');
  });

  it('should set effectiveAt to now when not provided', async () => {
    const sut = makeSut();
    const before = new Date();

    const result = await sut.execute({
      tenantId: 'tenant-1',
      amount: 75,
      description: 'Test adjustment',
      reason: 'Test reason',
      actor: opActor,
    });

    const after = new Date();
    expect(result.effectiveAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.effectiveAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should use provided effectiveAt when given', async () => {
    const sut = makeSut();
    const customDate = new Date('2026-04-01T00:00:00Z');

    const result = await sut.execute({
      tenantId: 'tenant-1',
      amount: 75,
      description: 'Test adjustment',
      reason: 'Test reason',
      effectiveAt: customDate,
      actor: opActor,
    });

    expect(result.effectiveAt).toEqual(customDate);
  });

  it('should set optional fields to null when not provided', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      tenantId: 'tenant-1',
      amount: 75,
      description: 'Test adjustment',
      reason: 'Test reason',
      actor: opActor,
    });

    expect(result.appointmentId).toBeNull();
    expect(result.inspectorId).toBeNull();
    expect(result.referenceEntryId).toBeNull();
  });

  it('should reject non-AM/OP actor', async () => {
    const sut = makeSut();
    const inspActor = {
      userId: 'insp-1',
      tenantId: 'tenant-1',
      role: 'INSP' as const,
      branchId: null,
    };

    await expect(
      sut.execute({
        tenantId: 'tenant-1',
        amount: 50,
        description: 'Adjustment',
        reason: 'Reason',
        actor: inspActor,
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(financialEntryRepo.save).not.toHaveBeenCalled();
  });

  it('should audit log the manual adjustment creation', async () => {
    const sut = makeSut();

    await sut.execute({
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      amount: 50,
      description: 'Late fee adjustment',
      reason: 'Inspector arrived late',
      actor: opActor,
    });

    expect(auditService.log).toHaveBeenCalledOnce();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'financial_entry.manual_adjustment_created',
        actorType: 'USER',
        actorId: 'op-1',
        entityType: 'FinancialEntry',
        tenantId: 'tenant-1',
        after: expect.objectContaining({
          entryType: 'MANUAL_ADJUSTMENT',
          amount: 50,
        }),
      }),
    );
  });
});
