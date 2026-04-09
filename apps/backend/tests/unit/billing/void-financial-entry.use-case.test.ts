import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoidFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/void-financial-entry.use-case';
import type { IFinancialEntryRepository } from '../../../src/modules/billing/domain/financial-entry.repository';
import { FinancialEntryEntity, type FinancialEntryProps } from '../../../src/modules/billing/domain/financial-entry.entity';
import { EntryNotFoundError, EntryNotApprovedError } from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

function makeEntry(overrides: Partial<FinancialEntryProps> = {}): FinancialEntryEntity {
  const now = new Date();
  return new FinancialEntryEntity({
    id: 'entry-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    inspectorId: null,
    entryType: 'TENANT_DEBIT',
    amount: 500,
    currency: 'AUD',
    status: 'APPROVED',
    description: 'Tenant debit for inspection',
    effectiveAt: now,
    initiatedByUserId: 'user-op',
    approvedByUserId: 'user-am',
    approvedAt: now,
    referenceEntryId: null,
    reason: null,
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

  const authorizationService = new AuthorizationService(auditService);
  const useCase = new VoidFinancialEntryUseCase(financialEntryRepo, auditService, authorizationService);

  return { useCase, financialEntryRepo, auditService };
}

describe('VoidFinancialEntryUseCase', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('should void an APPROVED entry successfully', async () => {
    const { useCase, financialEntryRepo, auditService } = sut;

    vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry({ status: 'APPROVED' }));
    vi.mocked(financialEntryRepo.voidEntry).mockResolvedValue(undefined);

    const result = await useCase.execute({
      entryId: 'entry-1',
      reason: 'Entry was created in error',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.status).toBe('VOIDED');
    expect(result.id).toBe('entry-1');
    expect(result.voidedBy).toBe('user-am');
    expect(result.voidReason).toBe('Entry was created in error');
    expect(result.voidedAt).toBeInstanceOf(Date);

    expect(financialEntryRepo.voidEntry).toHaveBeenCalledWith(
      'entry-1',
      'tenant-1',
      'user-am',
      expect.any(Date),
      'Entry was created in error',
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'financial_entry.voided',
        entityType: 'FinancialEntry',
        entityId: 'entry-1',
        tenantId: 'tenant-1',
        reason: 'Entry was created in error',
      }),
    );
  });

  it('should reject PENDING entry (cannot void non-APPROVED)', async () => {
    const { useCase, financialEntryRepo } = sut;

    vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry({ status: 'PENDING' }));

    await expect(
      useCase.execute({
        entryId: 'entry-1',
        reason: 'Test reason',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(EntryNotApprovedError);

    expect(financialEntryRepo.voidEntry).not.toHaveBeenCalled();
  });

  it('should reject CANCELLED entry (cannot void non-APPROVED)', async () => {
    const { useCase, financialEntryRepo } = sut;

    vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry({ status: 'CANCELLED' }));

    await expect(
      useCase.execute({
        entryId: 'entry-1',
        reason: 'Test reason',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(EntryNotApprovedError);
  });

  it('should reject non-AM actor (OP forbidden)', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        entryId: 'entry-1',
        reason: 'Test reason',
        actor: makeActor({ role: 'OP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject non-AM actor (CL_ADMIN forbidden)', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        entryId: 'entry-1',
        reason: 'Test reason',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject non-AM actor (INSP forbidden)', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        entryId: 'entry-1',
        reason: 'Test reason',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw EntryNotFoundError for non-existent entry', async () => {
    const { useCase, financialEntryRepo } = sut;

    vi.mocked(financialEntryRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        entryId: 'non-existent',
        reason: 'Test reason',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(EntryNotFoundError);
  });
});
