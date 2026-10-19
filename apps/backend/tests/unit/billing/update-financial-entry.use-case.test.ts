import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/update-financial-entry.use-case';
import type { IFinancialEntryRepository } from '../../../src/modules/billing/domain/financial-entry.repository';
import { FinancialEntryEntity, type FinancialEntryProps } from '../../../src/modules/billing/domain/financial-entry.entity';
import {
  EntryNotFoundError,
  EntryNotEditableError,
  BillingIdempotencyPayloadMismatchError,
  BillingIdempotencyInProgressError,
} from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

const CREATED_AT = new Date('2026-03-01T00:00:00.000Z');
const UPDATED_AT = new Date('2026-04-02T10:00:00.000Z');

function makeEntry(overrides: Partial<FinancialEntryProps> = {}): FinancialEntryEntity {
  return new FinancialEntryEntity({
    id: 'entry-1',
    tenantId: 'tenant-1',
    appointmentId: null,
    inspectorId: null,
    entryType: 'MANUAL_ADJUSTMENT',
    amount: 100,
    currency: 'AUD',
    status: 'PENDING',
    description: 'Original description',
    effectiveAt: new Date('2026-03-15T00:00:00.000Z'),
    initiatedByUserId: 'user-op',
    approvedByUserId: null,
    approvedAt: null,
    referenceEntryId: null,
    reason: 'Original reason',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
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
    getInspectorEarningsSummary: vi.fn(),
    findByAppointmentAndType: vi.fn(),
    findByReferenceEntryIdAndType: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    updateStatus: vi.fn(),
    transitionStatus: vi.fn(),
    updateManualAdjustmentFields: vi.fn(),
    sumApprovedPayoutsForInspectorInPeriod: vi.fn(),
    aggregateApprovedPayoutsForInspectorInPeriod: vi.fn(),
    findApprovedPayoutLinesForSnapshot: vi.fn(),
    sumRefundsByReferenceEntryId: vi.fn(),
    sumApprovedEntriesForTenantInPeriod: vi.fn(),
    voidEntry: vi.fn(),
  } as unknown as IFinancialEntryRepository;

  const auditService = { log: vi.fn() } as unknown as AuditService;
  const authorizationService = new AuthorizationService(auditService);
  const idempotencyService = {
    tryAcquire: vi.fn().mockResolvedValue({ status: 'acquired', ownerToken: 'token-1' }),
    complete: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const useCase = new UpdateFinancialEntryUseCase(financialEntryRepo, auditService, authorizationService, idempotencyService);

  return { useCase, financialEntryRepo, auditService, idempotencyService };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    entryId: 'entry-1',
    amount: 250,
    description: 'Corrected amount',
    effectiveAt: new Date('2026-04-01T00:00:00.000Z'),
    reason: 'Operator correction',
    idempotencyKey: 'idem-1',
    actor: makeActor({ role: 'AM' }),
    ...overrides,
  };
}

describe('UpdateFinancialEntryUseCase', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('edits a PENDING MANUAL_ADJUSTMENT and returns the re-read entry', async () => {
    const { useCase, financialEntryRepo, auditService } = sut;
    const loaded = makeEntry();
    const updated = makeEntry({
      amount: 250,
      description: 'Corrected amount',
      effectiveAt: new Date('2026-04-01T00:00:00.000Z'),
      reason: 'Operator correction',
      initiatedByUserId: 'user-am', // editor recorded as the economic-content author
      updatedAt: UPDATED_AT,
    });
    vi.mocked(financialEntryRepo.findById)
      .mockResolvedValueOnce(loaded)
      .mockResolvedValueOnce(updated);
    vi.mocked(financialEntryRepo.updateManualAdjustmentFields).mockResolvedValue(1);

    const result = await useCase.execute(baseInput());

    expect(result.id).toBe('entry-1');
    expect(result.amount).toBe(250);
    expect(result.description).toBe('Corrected amount');
    expect(result.reason).toBe('Operator correction');
    expect(result.status).toBe('PENDING');
    expect(result.entryType).toBe('MANUAL_ADJUSTMENT');
    expect(result.updatedAt).toEqual(UPDATED_AT);

    // Editor (actor.userId) is passed as the recorded author, not the original initiator.
    expect(financialEntryRepo.updateManualAdjustmentFields).toHaveBeenCalledWith('entry-1', 'tenant-1', 'user-am', {
      amount: 250,
      description: 'Corrected amount',
      effectiveAt: new Date('2026-04-01T00:00:00.000Z'),
      reason: 'Operator correction',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'financial_entry.updated',
        entityType: 'FinancialEntry',
        entityId: 'entry-1',
        tenantId: 'tenant-1',
        before: expect.objectContaining({ amount: 100, description: 'Original description', initiatedByUserId: 'user-op' }),
        after: expect.objectContaining({ amount: 250, description: 'Corrected amount', initiatedByUserId: 'user-am' }),
      }),
    );
  });

  it('records the editor as the economic-content author so they cannot self-approve (SoD)', async () => {
    const { useCase, financialEntryRepo } = sut;
    const loaded = makeEntry({ initiatedByUserId: 'user-creator' });
    const updated = makeEntry({ amount: 250, initiatedByUserId: 'user-am', updatedAt: UPDATED_AT });
    vi.mocked(financialEntryRepo.findById).mockResolvedValueOnce(loaded).mockResolvedValueOnce(updated);
    vi.mocked(financialEntryRepo.updateManualAdjustmentFields).mockResolvedValue(1);

    const result = await useCase.execute(baseInput({ actor: makeActor({ userId: 'user-am', role: 'AM' }) }));

    // The persisted initiator is rebound to the editor (3rd arg), and surfaced in the output,
    // so a later approve by 'user-am' hits assertNotSelfApproval and is rejected.
    expect(financialEntryRepo.updateManualAdjustmentFields).toHaveBeenCalledWith('entry-1', 'tenant-1', 'user-am', expect.anything());
    expect(result.initiatedByUserId).toBe('user-am');
  });

  it('passes through only the provided fields on a partial update', async () => {
    const { useCase, financialEntryRepo } = sut;
    vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry());
    vi.mocked(financialEntryRepo.updateManualAdjustmentFields).mockResolvedValue(1);

    await useCase.execute(baseInput({ amount: 999, description: undefined, effectiveAt: undefined, reason: undefined }));

    expect(financialEntryRepo.updateManualAdjustmentFields).toHaveBeenCalledWith('entry-1', 'tenant-1', 'user-am', {
      amount: 999,
      description: undefined,
      effectiveAt: undefined,
      reason: undefined,
    });
  });

  it('allows OP (cross-tenant financial intervention)', async () => {
    const { useCase, financialEntryRepo } = sut;
    vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry());
    vi.mocked(financialEntryRepo.updateManualAdjustmentFields).mockResolvedValue(1);

    const result = await useCase.execute(baseInput({ actor: makeActor({ role: 'OP', tenantId: 'tenant-9' }) }));
    expect(result.status).toBe('PENDING');
  });

  it.each(['CL_ADMIN', 'CL_USER', 'INSP'] as const)('rejects %s with ForbiddenError', async (role) => {
    const { useCase, financialEntryRepo } = sut;
    await expect(
      useCase.execute(baseInput({ actor: makeActor({ role, tenantId: 'tenant-1' }) })),
    ).rejects.toThrow(ForbiddenError);
    expect(financialEntryRepo.updateManualAdjustmentFields).not.toHaveBeenCalled();
  });

  it('throws EntryNotFoundError when the entry does not exist', async () => {
    const { useCase, financialEntryRepo } = sut;
    vi.mocked(financialEntryRepo.findById).mockResolvedValue(null);
    await expect(useCase.execute(baseInput())).rejects.toThrow(EntryNotFoundError);
    expect(financialEntryRepo.updateManualAdjustmentFields).not.toHaveBeenCalled();
  });

  it('rejects a system-minted TENANT_DEBIT with EntryNotEditableError (guard: type)', async () => {
    const { useCase, financialEntryRepo, auditService } = sut;
    vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry({ entryType: 'TENANT_DEBIT' }));
    await expect(useCase.execute(baseInput())).rejects.toThrow(EntryNotEditableError);
    expect(financialEntryRepo.updateManualAdjustmentFields).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('rejects an INSPECTOR_PAYOUT with EntryNotEditableError (guard: type)', async () => {
    const { useCase, financialEntryRepo } = sut;
    vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry({ entryType: 'INSPECTOR_PAYOUT' }));
    await expect(useCase.execute(baseInput())).rejects.toThrow(EntryNotEditableError);
    expect(financialEntryRepo.updateManualAdjustmentFields).not.toHaveBeenCalled();
  });

  it('rejects an APPROVED manual adjustment with EntryNotEditableError (guard: status)', async () => {
    const { useCase, financialEntryRepo } = sut;
    vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry({ status: 'APPROVED' }));
    await expect(useCase.execute(baseInput())).rejects.toThrow(EntryNotEditableError);
    expect(financialEntryRepo.updateManualAdjustmentFields).not.toHaveBeenCalled();
  });

  it('rejects a VOIDED manual adjustment with EntryNotEditableError (guard: status)', async () => {
    const { useCase, financialEntryRepo } = sut;
    vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry({ status: 'VOIDED' }));
    await expect(useCase.execute(baseInput())).rejects.toThrow(EntryNotEditableError);
  });

  it('throws EntryNotEditableError when the atomic guard loses the race (count 0)', async () => {
    const { useCase, financialEntryRepo, auditService } = sut;
    // canBeEdited() passed on load, but a concurrent approve/void flipped the row
    // before our guarded UPDATE landed, so updateMany matched nothing.
    vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry());
    vi.mocked(financialEntryRepo.updateManualAdjustmentFields).mockResolvedValue(0);
    await expect(useCase.execute(baseInput())).rejects.toThrow(EntryNotEditableError);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  describe('idempotency (mirrors HOL-3b)', () => {
    it('returns the cached response on replay without touching the repository', async () => {
      const { useCase, financialEntryRepo, auditService, idempotencyService } = sut;
      const cached = {
        id: 'entry-1',
        tenantId: 'tenant-1',
        appointmentId: null,
        inspectorId: null,
        entryType: 'MANUAL_ADJUSTMENT',
        amount: 250,
        currency: 'AUD',
        status: 'PENDING',
        description: 'Corrected amount',
        effectiveAt: '2026-04-01T00:00:00.000Z',
        initiatedByUserId: 'user-op',
        approvedByUserId: null,
        approvedAt: null,
        referenceEntryId: null,
        reason: 'Operator correction',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-04-02T10:00:00.000Z',
      };
      vi.mocked(idempotencyService.tryAcquire).mockImplementation(async (_k: string, _s: string, payloadHash: string) => ({
        status: 'completed',
        response: cached,
        payloadHash,
      }));

      const result = await useCase.execute(baseInput());

      expect(result).toEqual(cached);
      expect(financialEntryRepo.findById).not.toHaveBeenCalled();
      expect(financialEntryRepo.updateManualAdjustmentFields).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('throws a conflict when the same key is replayed with a different payload', async () => {
      const { useCase, financialEntryRepo, idempotencyService } = sut;
      vi.mocked(idempotencyService.tryAcquire).mockResolvedValue({ status: 'in_progress', payloadHash: 'a-different-hash' });
      await expect(useCase.execute(baseInput())).rejects.toThrow(BillingIdempotencyPayloadMismatchError);
      expect(financialEntryRepo.updateManualAdjustmentFields).not.toHaveBeenCalled();
    });

    it('throws a conflict when a request with the same key + payload is already in progress', async () => {
      const { useCase, financialEntryRepo, idempotencyService } = sut;
      vi.mocked(idempotencyService.tryAcquire).mockImplementation(async (_k: string, _s: string, payloadHash: string) => ({
        status: 'in_progress',
        payloadHash,
      }));
      await expect(useCase.execute(baseInput())).rejects.toThrow(BillingIdempotencyInProgressError);
      expect(financialEntryRepo.updateManualAdjustmentFields).not.toHaveBeenCalled();
    });

    it('releases the claim when the mutation throws', async () => {
      const { useCase, financialEntryRepo, idempotencyService } = sut;
      vi.mocked(financialEntryRepo.findById).mockResolvedValue(makeEntry());
      vi.mocked(financialEntryRepo.updateManualAdjustmentFields).mockRejectedValue(new Error('db down'));
      await expect(useCase.execute(baseInput())).rejects.toThrow('db down');
      expect(idempotencyService.release).toHaveBeenCalledWith('idem-1', 'update-entry', expect.any(String), 'token-1');
    });
  });
});
