import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateManualAdjustmentUseCase } from '../../../src/modules/billing/application/use-cases/create-manual-adjustment.use-case';
import { FinancialEntryEntity } from '../../../src/modules/billing/domain/financial-entry.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { TenantInactiveError, TenantNotFoundError } from '../../../src/modules/tenant/domain/tenant.errors';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
import { EntryNotFoundError, InspectorNotFoundError } from '../../../src/modules/billing/domain/billing.errors';

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

const tenantRepo = {
  findById: vi.fn(),
  findByLegalName: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const appointmentRepo = {
  findById: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  saveContact: vi.fn(),
  updateContact: vi.fn(),
  saveRestriction: vi.fn(),
  deleteRestrictionsByAppointmentId: vi.fn(),
  findScheduledOnDate: vi.fn(),
  findAllContacts: vi.fn(),
  countContacts: vi.fn(),
  findContactById: vi.fn(),
  findDuplicateForImport: vi.fn(),
};

const inspectorRepo = {
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  linkUserId: vi.fn(),
  findByRegionId: vi.fn(),
};

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

const authorizationService = new AuthorizationService(auditService as any);

function makeSut() {
  return new CreateManualAdjustmentUseCase(
    financialEntryRepo,
    auditService as any,
    idempotencyService,
    tenantRepo,
    appointmentRepo as any,
    inspectorRepo as any,
    authorizationService,
  );
}

describe('CreateManualAdjustmentUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financialEntryRepo.save.mockResolvedValue(undefined);
    idempotencyService.get.mockResolvedValue(null);
    tenantRepo.findById.mockResolvedValue({
      id: 'tenant-1',
      currency: 'AUD',
      isActive: () => true,
    });
    appointmentRepo.findById.mockResolvedValue({
      appointment: {
        id: 'appt-1',
        tenantId: 'tenant-1',
      },
    });
    inspectorRepo.findById.mockResolvedValue({
      id: 'insp-1',
      isActive: () => true,
      isEligibleForTenant: (tenantId: string) => tenantId === 'tenant-1',
    });
    financialEntryRepo.findById.mockResolvedValue({
      id: 'entry-1',
      tenantId: 'tenant-1',
    });
  });

  it('should return cached result on duplicate call when idempotencyKey is provided', async () => {
    const cachedResult = {
      id: 'cached-id',
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      inspectorId: null,
      entryType: 'MANUAL_ADJUSTMENT' as const,
      amount: 50,
      currency: 'AUD',
      status: 'PENDING' as const,
      description: 'Late fee adjustment',
      reason: 'Inspector arrived late',
      effectiveAt: new Date('2026-03-17T00:00:00Z'),
      initiatedByUserId: 'op-1',
      referenceEntryId: null,
      createdAt: new Date('2026-03-17T00:00:00Z'),
    };
    idempotencyService.get.mockResolvedValue(cachedResult);

    const sut = makeSut();
    const result = await sut.execute({
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      amount: 50,
      description: 'Late fee adjustment',
      reason: 'Inspector arrived late',
      idempotencyKey: 'my-idem-key',
      actor: opActor,
    });

    expect(result).toEqual(cachedResult);
    expect(financialEntryRepo.save).not.toHaveBeenCalled();
    expect(idempotencyService.get).toHaveBeenCalledWith('my-idem-key', 'manual-adjustment');
  });

  it('should cache result after successful execution when idempotencyKey is provided', async () => {
    const sut = makeSut();

    await sut.execute({
      tenantId: 'tenant-1',
      amount: 50,
      description: 'Late fee adjustment',
      reason: 'Inspector arrived late',
      idempotencyKey: 'my-idem-key',
      actor: opActor,
    });

    expect(idempotencyService.set).toHaveBeenCalledWith(
      'my-idem-key',
      'manual-adjustment',
      expect.objectContaining({
        entryType: 'MANUAL_ADJUSTMENT',
        amount: 50,
      }),
      24,
    );
  });

  it('should not check idempotency when idempotencyKey is not provided', async () => {
    const sut = makeSut();

    await sut.execute({
      tenantId: 'tenant-1',
      amount: 50,
      description: 'Late fee adjustment',
      reason: 'Inspector arrived late',
      actor: opActor,
    });

    expect(idempotencyService.get).not.toHaveBeenCalled();
    expect(idempotencyService.set).not.toHaveBeenCalled();
    expect(financialEntryRepo.save).toHaveBeenCalledOnce();
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
      inspectorId: null,
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

  it('should use tenant currency instead of hardcoded AUD', async () => {
    tenantRepo.findById.mockResolvedValue({ id: 'tenant-1', currency: 'NZD', isActive: () => true });
    const sut = makeSut();

    const result = await sut.execute({
      tenantId: 'tenant-1',
      amount: 50,
      description: 'Test',
      reason: 'Test',
      actor: opActor,
    });

    expect(result.currency).toBe('NZD');
    const savedEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(savedEntry.currency).toBe('NZD');
  });

  it('should reject when tenant is not found', async () => {
    tenantRepo.findById.mockResolvedValue(null);
    const sut = makeSut();

    await expect(
      sut.execute({
        tenantId: 'tenant-1',
        amount: 50,
        description: 'Test',
        reason: 'Test',
        actor: opActor,
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('should reject when tenant is inactive', async () => {
    tenantRepo.findById.mockResolvedValue({
      id: 'tenant-1',
      currency: 'AUD',
      isActive: () => false,
    });
    const sut = makeSut();

    await expect(
      sut.execute({
        tenantId: 'tenant-1',
        amount: 50,
        description: 'Test',
        reason: 'Test',
        actor: opActor,
      }),
    ).rejects.toThrow(TenantInactiveError);
  });

  it('should reject when appointment is not found', async () => {
    appointmentRepo.findById.mockResolvedValue(null);
    const sut = makeSut();

    await expect(
      sut.execute({
        tenantId: 'tenant-1',
        appointmentId: 'appt-1',
        amount: 50,
        description: 'Test',
        reason: 'Test',
        actor: opActor,
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should reject cross-tenant appointment references', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: {
        id: 'appt-1',
        tenantId: 'tenant-2',
      },
    });
    const sut = makeSut();

    await expect(
      sut.execute({
        tenantId: 'tenant-1',
        appointmentId: 'appt-1',
        amount: 50,
        description: 'Test',
        reason: 'Test',
        actor: opActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject when reference entry is not found', async () => {
    financialEntryRepo.findById.mockResolvedValue(null);
    const sut = makeSut();

    await expect(
      sut.execute({
        tenantId: 'tenant-1',
        referenceEntryId: 'entry-1',
        amount: 50,
        description: 'Test',
        reason: 'Test',
        actor: opActor,
      }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('should reject cross-tenant reference entries', async () => {
    financialEntryRepo.findById.mockResolvedValue({
      id: 'entry-1',
      tenantId: 'tenant-2',
    });
    const sut = makeSut();

    await expect(
      sut.execute({
        tenantId: 'tenant-1',
        referenceEntryId: 'entry-1',
        amount: 50,
        description: 'Test',
        reason: 'Test',
        actor: opActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject when inspector is not found or inactive', async () => {
    inspectorRepo.findById.mockResolvedValue(null);
    const sut = makeSut();

    await expect(
      sut.execute({
        tenantId: 'tenant-1',
        inspectorId: 'insp-1',
        amount: 50,
        description: 'Test',
        reason: 'Test',
        actor: opActor,
      }),
    ).rejects.toThrow(InspectorNotFoundError);
  });

  it('should reject inspectors not eligible for tenant', async () => {
    inspectorRepo.findById.mockResolvedValue({
      id: 'insp-1',
      isActive: () => true,
      isEligibleForTenant: () => false,
    });
    const sut = makeSut();

    await expect(
      sut.execute({
        tenantId: 'tenant-1',
        inspectorId: 'insp-1',
        amount: 50,
        description: 'Test',
        reason: 'Test',
        actor: opActor,
      }),
    ).rejects.toThrow(ForbiddenError);
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
