import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateFinancialEntriesOnDoneUseCase } from '../../../src/modules/billing/application/use-cases/create-financial-entries-on-done.use-case';
import { FinancialEntryEntity } from '../../../src/modules/billing/domain/financial-entry.entity';
import { FinancialEntryDoneCheckRequiredError } from '../../../src/modules/billing/domain/billing.errors';

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

function makeAppointment(overrides = {}) {
  return {
    appointment: {
      id: 'appt-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      propertyId: 'prop-1',
      serviceTypeId: 'st-1',
      inspectorId: 'insp-1',
      status: 'DONE',
      scheduledDate: new Date('2026-03-20'),
      timeSlotStart: '09:00', timeSlotEnd: '11:00',
      keyRequired: false,
      meetingLocation: null,
      keyLocation: null,
      rentalTenantConfirmationStatus: 'CONFIRMED',
      priceAmount: 200,
      payoutAmount: 140,
      pricingRuleSnapshotJson: {},
      notes: null,
      customFieldsJson: null,
      reason: null,
      createdByUserId: 'user-1',
      doneCheckedByUserId: 'op-1',
      doneCheckedAt: new Date(),
      serviceGroupId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    },
    contact: null,
    restrictions: [],
  };
}

function makeSut() {
  return new CreateFinancialEntriesOnDoneUseCase(
    appointmentRepo,
    financialEntryRepo,
    auditService as any,
    idempotencyService,
    tenantRepo,
  );
}

describe('CreateFinancialEntriesOnDoneUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appointmentRepo.findById.mockResolvedValue(makeAppointment());
    financialEntryRepo.findByAppointmentAndType.mockResolvedValue(null);
    financialEntryRepo.save.mockResolvedValue(undefined);
    idempotencyService.get.mockResolvedValue(null);
    tenantRepo.findById.mockResolvedValue({
      id: 'tenant-1',
      currency: 'AUD',
      isActive: () => true,
    });
  });

  it('should return cached result on duplicate call (idempotency)', async () => {
    const cachedResult = { debitEntryId: 'cached-debit', payoutEntryId: 'cached-payout' };
    idempotencyService.get.mockResolvedValue(cachedResult);

    const sut = makeSut();
    const result = await sut.execute({ appointmentId: 'appt-1' });

    expect(result).toEqual(cachedResult);
    expect(appointmentRepo.findById).not.toHaveBeenCalled();
    expect(financialEntryRepo.save).not.toHaveBeenCalled();
    expect(idempotencyService.get).toHaveBeenCalledWith('financial-entries-on-done:appt-1', 'financial-entries-on-done');
  });

  it('should cache result after successful execution', async () => {
    const sut = makeSut();

    await sut.execute({ appointmentId: 'appt-1' });

    expect(idempotencyService.set).toHaveBeenCalledWith(
      'financial-entries-on-done:appt-1',
      'financial-entries-on-done',
      expect.objectContaining({
        debitEntryId: expect.any(String),
        payoutEntryId: expect.any(String),
      }),
      24,
    );
  });

  it('should create TENANT_DEBIT (PENDING) and INSPECTOR_PAYOUT (PENDING) for a DONE appointment', async () => {
    const sut = makeSut();

    const result = await sut.execute({ appointmentId: 'appt-1' });

    expect(result.debitEntryId).toBeDefined();
    expect(result.payoutEntryId).toBeDefined();
    expect(result.debitEntryId).not.toBeNull();
    expect(result.payoutEntryId).not.toBeNull();

    expect(financialEntryRepo.save).toHaveBeenCalledTimes(2);

    const debitEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(debitEntry.entryType).toBe('TENANT_DEBIT');
    expect(debitEntry.amount).toBe(200);
    expect(debitEntry.status).toBe('PENDING');
    expect(debitEntry.currency).toBe('AUD');
    expect(debitEntry.tenantId).toBe('tenant-1');
    expect(debitEntry.appointmentId).toBe('appt-1');
    expect(debitEntry.inspectorId).toBeNull();
    expect(debitEntry.initiatedByUserId).toBe('SYSTEM');
    expect(debitEntry.approvedByUserId).toBeNull();
    expect(debitEntry.approvedAt).toBeNull();
    expect(debitEntry.description).toBe('Inspection service debit');

    const payoutEntry = financialEntryRepo.save.mock.calls[1][0] as FinancialEntryEntity;
    expect(payoutEntry.entryType).toBe('INSPECTOR_PAYOUT');
    expect(payoutEntry.amount).toBe(140);
    expect(payoutEntry.status).toBe('PENDING');
    expect(payoutEntry.currency).toBe('AUD');
    expect(payoutEntry.tenantId).toBe('tenant-1');
    expect(payoutEntry.appointmentId).toBe('appt-1');
    expect(payoutEntry.inspectorId).toBe('insp-1');
    expect(payoutEntry.initiatedByUserId).toBe('SYSTEM');
    expect(payoutEntry.description).toBe('Inspector payout');
  });

  it('should use priceAmount for debit and payoutAmount for payout', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(
      makeAppointment({ priceAmount: 500, payoutAmount: 350 }),
    );

    await sut.execute({ appointmentId: 'appt-1' });

    const debitEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(debitEntry.amount).toBe(500);

    const payoutEntry = financialEntryRepo.save.mock.calls[1][0] as FinancialEntryEntity;
    expect(payoutEntry.amount).toBe(350);
  });

  it('should generate deterministic ids for automatic entries', async () => {
    const sut = makeSut();

    await sut.execute({ appointmentId: 'appt-1' });
    const firstDebit = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    const firstPayout = financialEntryRepo.save.mock.calls[1][0] as FinancialEntryEntity;

    vi.clearAllMocks();
    appointmentRepo.findById.mockResolvedValue(makeAppointment());
    financialEntryRepo.findByAppointmentAndType.mockResolvedValue(null);
    financialEntryRepo.save.mockResolvedValue(undefined);
    idempotencyService.get.mockResolvedValue(null);
    tenantRepo.findById.mockResolvedValue({
      id: 'tenant-1',
      currency: 'AUD',
      isActive: () => true,
    });

    await sut.execute({ appointmentId: 'appt-1' });
    const secondDebit = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    const secondPayout = financialEntryRepo.save.mock.calls[1][0] as FinancialEntryEntity;

    expect(firstDebit.id).toBe(secondDebit.id);
    expect(firstPayout.id).toBe(secondPayout.id);
  });

  it('should skip creating entries if both already exist (idempotent)', async () => {
    const sut = makeSut();
    const existingEntry = new FinancialEntryEntity({
      id: 'existing-1',
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      inspectorId: null,
      entryType: 'TENANT_DEBIT',
      amount: 200,
      currency: 'AUD',
      status: 'PENDING',
      description: 'Inspection service debit',
      effectiveAt: new Date(),
      initiatedByUserId: 'SYSTEM',
      approvedByUserId: null,
      approvedAt: null,
      referenceEntryId: null,
      reason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    financialEntryRepo.findByAppointmentAndType.mockResolvedValue(existingEntry);

    const result = await sut.execute({ appointmentId: 'appt-1' });

    expect(result.debitEntryId).toBeNull();
    expect(result.payoutEntryId).toBeNull();
    expect(financialEntryRepo.save).not.toHaveBeenCalled();
  });

  it('should skip TENANT_DEBIT but create INSPECTOR_PAYOUT if only debit exists', async () => {
    const sut = makeSut();
    const existingDebit = new FinancialEntryEntity({
      id: 'existing-debit',
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      inspectorId: null,
      entryType: 'TENANT_DEBIT',
      amount: 200,
      currency: 'AUD',
      status: 'PENDING',
      description: 'Inspection service debit',
      effectiveAt: new Date(),
      initiatedByUserId: 'SYSTEM',
      approvedByUserId: null,
      approvedAt: null,
      referenceEntryId: null,
      reason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    financialEntryRepo.findByAppointmentAndType
      .mockResolvedValueOnce(existingDebit) // TENANT_DEBIT exists
      .mockResolvedValueOnce(null); // INSPECTOR_PAYOUT does not exist

    const result = await sut.execute({ appointmentId: 'appt-1' });

    expect(result.debitEntryId).toBeNull();
    expect(result.payoutEntryId).not.toBeNull();
    expect(financialEntryRepo.save).toHaveBeenCalledOnce();

    const payoutEntry = financialEntryRepo.save.mock.calls[0][0] as FinancialEntryEntity;
    expect(payoutEntry.entryType).toBe('INSPECTOR_PAYOUT');
  });

  it('should treat duplicate save during concurrent creation as already created', async () => {
    const sut = makeSut();
    const duplicateDebit = new FinancialEntryEntity({
      id: 'existing-debit',
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      inspectorId: null,
      entryType: 'TENANT_DEBIT',
      amount: 200,
      currency: 'AUD',
      status: 'PENDING',
      description: 'Inspection service debit',
      effectiveAt: new Date(),
      initiatedByUserId: 'SYSTEM',
      approvedByUserId: null,
      approvedAt: null,
      referenceEntryId: null,
      reason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    financialEntryRepo.findByAppointmentAndType
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(duplicateDebit)
      .mockResolvedValueOnce(null);
    financialEntryRepo.save
      .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
      .mockResolvedValueOnce(undefined);

    const result = await sut.execute({ appointmentId: 'appt-1' });

    expect(result.debitEntryId).toBeNull();
    expect(result.payoutEntryId).not.toBeNull();
    expect(financialEntryRepo.save).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });

  it('should throw FinancialEntryDoneCheckRequiredError when doneCheckedByUserId is not set', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(
      makeAppointment({ doneMarkedByUserId: null,
    doneCheckedByUserId: null, doneCheckedAt: null }),
    );

    await expect(sut.execute({ appointmentId: 'appt-1' })).rejects.toThrow(
      FinancialEntryDoneCheckRequiredError,
    );
    expect(financialEntryRepo.save).not.toHaveBeenCalled();
  });

  it('should return nulls silently if appointment is not DONE', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(makeAppointment({ status: 'SCHEDULED' }));

    const result = await sut.execute({ appointmentId: 'appt-1' });

    expect(result.debitEntryId).toBeNull();
    expect(result.payoutEntryId).toBeNull();
    expect(financialEntryRepo.save).not.toHaveBeenCalled();
  });

  it('should return nulls silently if appointment not found', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(null);

    const result = await sut.execute({ appointmentId: 'nonexistent' });

    expect(result.debitEntryId).toBeNull();
    expect(result.payoutEntryId).toBeNull();
    expect(financialEntryRepo.save).not.toHaveBeenCalled();
  });

  it('should audit log both entries when created', async () => {
    const sut = makeSut();

    await sut.execute({ appointmentId: 'appt-1' });

    expect(auditService.log).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'financial_entry.created',
        actorType: 'SYSTEM',
        entityType: 'FinancialEntry',
        tenantId: 'tenant-1',
        after: expect.objectContaining({ entryType: 'TENANT_DEBIT', status: 'PENDING' }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'financial_entry.created',
        actorType: 'SYSTEM',
        entityType: 'FinancialEntry',
        tenantId: 'tenant-1',
        after: expect.objectContaining({ entryType: 'INSPECTOR_PAYOUT' }),
      }),
    );
  });

  it('should use tenant currency instead of hardcoded AUD', async () => {
    tenantRepo.findById.mockResolvedValue({ id: 'tenant-1', currency: 'NZD', isActive: () => true });
    const sut = makeSut();
    await sut.execute({ appointmentId: 'appt-1' });

    const debitEntry = financialEntryRepo.save.mock.calls[0][0];
    expect(debitEntry.currency).toBe('NZD');
    const payoutEntry = financialEntryRepo.save.mock.calls[1][0];
    expect(payoutEntry.currency).toBe('NZD');
  });

  it('should default to AUD when tenant not found', async () => {
    tenantRepo.findById.mockResolvedValue(null);
    const sut = makeSut();
    await sut.execute({ appointmentId: 'appt-1' });

    const debitEntry = financialEntryRepo.save.mock.calls[0][0];
    expect(debitEntry.currency).toBe('AUD');
  });
});
