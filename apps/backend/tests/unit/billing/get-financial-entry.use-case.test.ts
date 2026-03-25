import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/get-financial-entry.use-case';
import type { IFinancialEntryRepository } from '../../../src/modules/billing/domain/financial-entry.repository';
import { FinancialEntryEntity, type FinancialEntryProps } from '../../../src/modules/billing/domain/financial-entry.entity';
import { EntryNotFoundError } from '../../../src/modules/billing/domain/billing.errors';
import type { AuthContext } from '@properfy/shared';
import type { FinancialEntryEnriched } from '../../../src/modules/billing/domain/financial-entry.repository';

function makeEntry(overrides: Partial<FinancialEntryProps> = {}): FinancialEntryEntity {
  const now = new Date('2026-03-15T10:00:00.000Z');
  const defaults: FinancialEntryProps = {
    id: 'entry-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    entryType: 'TENANT_DEBIT',
    amount: 200,
    currency: 'BRL',
    status: 'PENDING',
    description: 'Tenant debit for routine inspection',
    effectiveAt: now,
    initiatedByUserId: 'user-1',
    approvedByUserId: null,
    approvedAt: null,
    referenceEntryId: null,
    reason: null,
    createdAt: now,
    updatedAt: now,
  };
  return new FinancialEntryEntity({ ...defaults, ...overrides });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeEnriched(overrides: Partial<FinancialEntryProps> = {}): FinancialEntryEnriched {
  return {
    entity: makeEntry(overrides),
    appointmentCode: 'VIST-001',
    relatedEntityName: 'Properfy Realty',
    approvedByName: null,
  };
}

function makeSut() {
  const entryRepo: IFinancialEntryRepository = {
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
  };
  const useCase = new GetFinancialEntryUseCase(entryRepo);
  return { entryRepo, useCase };
}

describe('GetFinancialEntryUseCase', () => {
  let entryRepo: IFinancialEntryRepository;
  let useCase: GetFinancialEntryUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    entryRepo = sut.entryRepo;
    useCase = sut.useCase;
  });

  it('should return entry for AM', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(makeEnriched());

    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.id).toBe('entry-1');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.amount).toBe(200);
    expect(typeof result.amount).toBe('number');
    expect(entryRepo.findByIdEnriched).toHaveBeenCalledWith('entry-1', undefined);
  });

  it('should return entry for OP', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(makeEnriched());

    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.id).toBe('entry-1');
  });

  it('should return entry for CL_ADMIN when tenantId matches', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(makeEnriched({ tenantId: 'tenant-1' }));

    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBe('entry-1');
    expect(result.tenantId).toBe('tenant-1');
    expect(entryRepo.findByIdEnriched).toHaveBeenCalledWith('entry-1', 'tenant-1');
  });

  it('should throw EntryNotFoundError for CL_ADMIN when tenantId does not match', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(makeEnriched({ tenantId: 'tenant-other' }));

    await expect(
      useCase.execute({
        entryId: 'entry-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('should throw EntryNotFoundError for CL_USER when tenantId does not match', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(makeEnriched({ tenantId: 'tenant-other' }));

    await expect(
      useCase.execute({
        entryId: 'entry-1',
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('should return entry for INSP when inspectorId matches and entryType is INSPECTOR_PAYOUT', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(
      makeEnriched({
        inspectorId: 'insp-user-1',
        entryType: 'INSPECTOR_PAYOUT',
      }),
    );

    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: makeActor({ role: 'INSP', userId: 'insp-user-1', inspectorId: 'insp-user-1' }),
    });

    expect(result.id).toBe('entry-1');
    expect(result.entryType).toBe('INSPECTOR_PAYOUT');
  });

  it('should throw EntryNotFoundError when INSP tries to view non-INSPECTOR_PAYOUT entry', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(
      makeEnriched({
        inspectorId: 'insp-user-1',
        entryType: 'TENANT_DEBIT',
      }),
    );

    await expect(
      useCase.execute({
        entryId: 'entry-1',
        actor: makeActor({ role: 'INSP', userId: 'insp-user-1', inspectorId: 'insp-user-1' }),
      }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('should throw EntryNotFoundError when INSP tries to view another inspector entry', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(
      makeEnriched({
        inspectorId: 'other-inspector',
        entryType: 'INSPECTOR_PAYOUT',
      }),
    );

    await expect(
      useCase.execute({
        entryId: 'entry-1',
        actor: makeActor({ role: 'INSP', userId: 'insp-user-1', inspectorId: 'insp-user-1' }),
      }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('should throw EntryNotFoundError when entry does not exist', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(null);

    await expect(
      useCase.execute({
        entryId: 'nonexistent',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('should format dates as ISO strings', async () => {
    const effectiveAt = new Date('2026-03-15T10:00:00.000Z');
    const approvedAt = new Date('2026-03-15T12:00:00.000Z');
    const createdAt = new Date('2026-03-15T09:00:00.000Z');

    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(
      makeEnriched({ status: 'APPROVED', effectiveAt, approvedAt, approvedByUserId: 'approver-1', createdAt }),
    );

    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.effectiveAt).toBe('2026-03-15T10:00:00.000Z');
    expect(result.approvedAt).toBe('2026-03-15T12:00:00.000Z');
    expect(result.createdAt).toBe('2026-03-15T09:00:00.000Z');
  });

  it('should pass tenantId to findById for CL_ADMIN (defense-in-depth)', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(makeEnriched({ tenantId: 'tenant-1' }));

    await useCase.execute({
      entryId: 'entry-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(entryRepo.findByIdEnriched).toHaveBeenCalledWith('entry-1', 'tenant-1');
  });

  it('should pass tenantId to findById for CL_USER (defense-in-depth)', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(makeEnriched({ tenantId: 'tenant-1' }));

    await useCase.execute({
      entryId: 'entry-1',
      actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
    });

    expect(entryRepo.findByIdEnriched).toHaveBeenCalledWith('entry-1', 'tenant-1');
  });

  it('should not pass tenantId to findById for AM', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(makeEnriched());

    await useCase.execute({
      entryId: 'entry-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(entryRepo.findByIdEnriched).toHaveBeenCalledWith('entry-1', undefined);
  });

  it('should return null for approvedAt when not approved', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue(
      makeEnriched({ approvedAt: null, approvedByUserId: null }),
    );

    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.approvedAt).toBeNull();
    expect(result.approvedByUserId).toBeNull();
  });

  it('should mask approval metadata when entry is still pending', async () => {
    vi.mocked(entryRepo.findByIdEnriched).mockResolvedValue({
      ...makeEnriched({
        status: 'PENDING',
        approvedAt: new Date('2026-03-15T12:00:00.000Z'),
        approvedByUserId: 'approver-1',
      }),
      approvedByName: 'Approver Name',
    });

    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.status).toBe('PENDING');
    expect(result.approvedByUserId).toBeNull();
    expect(result.approvedAt).toBeNull();
    expect(result.approvedByName).toBeNull();
  });
});
