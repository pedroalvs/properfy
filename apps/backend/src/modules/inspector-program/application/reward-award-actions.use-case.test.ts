import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext, RewardAwardStatus } from '@properfy/shared';
import type { AuditService } from '../../../shared/domain/audit';
import type { Clock } from '../../../shared/domain/clock';
import { AuthorizationService } from '../../../shared/domain/authorization.service';
import { ForbiddenError } from '../../../shared/domain/errors';
import type { IIdempotencyService } from '../../../shared/domain/idempotency.service';
import type { IRewardAwardApprovalHook } from '../domain/reward-award-approval.hook';
import type { IRewardAwardRepository, RewardAwardWithRelations } from '../domain/reward-award.repository';
import {
  RewardAwardNotFoundError,
  RewardAwardInvalidStatusError,
  RewardAwardIdempotencyInProgressError,
  RewardAwardIdempotencyPayloadMismatchError,
  RewardAwardVoidRequiresAdminError,
} from '../domain/inspector-program.errors';
import { ApproveRewardAwardUseCase } from './use-cases/approve-reward-award.use-case';
import { VoidRewardAwardUseCase } from './use-cases/void-reward-award.use-case';

const NOW = new Date('2026-11-12T02:00:00.000Z');
const clock: Clock = { now: () => NOW };

function am(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-am', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
}

function buildAward(overrides: Partial<RewardAwardWithRelations> = {}): RewardAwardWithRelations {
  return {
    id: 'award-1',
    goalId: 'goal-1',
    inspectorId: 'insp-1',
    periodType: 'WEEKLY',
    periodStart: '2026-11-02',
    periodEnd: '2026-11-08',
    goalTitle: 'Weekly volume',
    metric: 'VOLUME',
    comparator: 'GTE',
    target: 10,
    amount: 30,
    scopeLabel: null,
    achievedValue: 12,
    serviceCount: 12,
    achievedOn: '2026-11-06',
    indexScoreAtClose: 88.3,
    levelAtClose: 'GOLD',
    indexSnapshotDate: '2026-11-08',
    status: 'PENDING',
    approvedByUserId: null,
    approvedAt: null,
    paidAt: null,
    voidedByUserId: null,
    voidedAt: null,
    voidReason: null,
    inspectorNote: null,
    inspectorInvoiceId: null,
    createdAt: new Date('2026-11-09T00:00:00.000Z'),
    updatedAt: new Date('2026-11-09T00:00:00.000Z'),
    goal: { id: 'goal-1', title: 'Weekly volume' },
    inspector: { id: 'insp-1', name: 'Ana', email: 'ana@example.com' },
    approvedBy: null,
    voidedBy: null,
    financialEntryId: null,
    invoice: null,
    ...overrides,
  };
}

function makeRewardRepo(): IRewardAwardRepository {
  return {
    insertManySkipDuplicates: vi.fn(),
    findByGoalPeriod: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    findByPeriod: vi.fn(),
    approvePending: vi.fn(),
    voidPendingOrApproved: vi.fn(),
    getStatusAndInvoice: vi.fn(),
    voidInvoiced: vi.fn(),
  };
}

function makeIdempotency(): IIdempotencyService {
  return {
    get: vi.fn(),
    getWithHash: vi.fn(),
    tryAcquire: vi.fn(async () => ({ status: 'acquired' as const, ownerToken: 'tok' })),
    complete: vi.fn(async () => true),
    renew: vi.fn(),
    release: vi.fn(async () => undefined),
    set: vi.fn(),
  };
}

function makeHook(): IRewardAwardApprovalHook {
  return { onApproved: vi.fn(async () => undefined), onVoided: vi.fn(async () => undefined) };
}

let auditService: AuditService;
let authorizationService: AuthorizationService;

beforeEach(() => {
  auditService = { log: vi.fn() };
  authorizationService = new AuthorizationService(auditService);
});

describe('ApproveRewardAwardUseCase', () => {
  it('approves a PENDING award via CAS, invokes the hook and audits', async () => {
    const rewardRepo = makeRewardRepo();
    (rewardRepo.findById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(buildAward())
      .mockResolvedValueOnce(buildAward({ status: 'APPROVED', approvedByUserId: 'user-am', approvedAt: NOW }));
    (rewardRepo.approvePending as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    const hook = makeHook();
    const useCase = new ApproveRewardAwardUseCase(rewardRepo, hook, auditService, authorizationService, makeIdempotency(), clock);

    const result = await useCase.execute({ awardId: 'award-1', idempotencyKey: 'key-1', actor: am({ role: 'OP' }) });

    expect(result.status).toBe('APPROVED');
    expect(rewardRepo.approvePending).toHaveBeenCalledWith('award-1', 'user-am', NOW, undefined);
    expect(hook.onApproved).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reward_award.approved' }));
  });

  it('returns 409 when the CAS loses the race (already approved)', async () => {
    const rewardRepo = makeRewardRepo();
    (rewardRepo.findById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(buildAward())
      .mockResolvedValueOnce(buildAward({ status: 'APPROVED' }));
    (rewardRepo.approvePending as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const useCase = new ApproveRewardAwardUseCase(
      rewardRepo,
      makeHook(),
      auditService,
      authorizationService,
      makeIdempotency(),
      clock,
    );
    await expect(useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', actor: am() })).rejects.toBeInstanceOf(
      RewardAwardInvalidStatusError,
    );
  });

  it('rejects approving a non-PENDING award (409)', async () => {
    const rewardRepo = makeRewardRepo();
    (rewardRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(buildAward({ status: 'APPROVED' }));
    const useCase = new ApproveRewardAwardUseCase(
      rewardRepo,
      makeHook(),
      auditService,
      authorizationService,
      makeIdempotency(),
      clock,
    );
    await expect(useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', actor: am() })).rejects.toBeInstanceOf(
      RewardAwardInvalidStatusError,
    );
    expect(rewardRepo.approvePending).not.toHaveBeenCalled();
  });

  it('throws when the award does not exist (404)', async () => {
    const rewardRepo = makeRewardRepo();
    (rewardRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new ApproveRewardAwardUseCase(
      rewardRepo,
      makeHook(),
      auditService,
      authorizationService,
      makeIdempotency(),
      clock,
    );
    await expect(useCase.execute({ awardId: 'missing', idempotencyKey: 'k', actor: am() })).rejects.toBeInstanceOf(
      RewardAwardNotFoundError,
    );
  });

  it('returns the cached response on an idempotent replay', async () => {
    const rewardRepo = makeRewardRepo();
    const idem = makeIdempotency();
    const cached = { id: 'award-1', status: 'APPROVED' };
    // A real completed claim carries the same payload hash (same key + same request).
    (idem.tryAcquire as ReturnType<typeof vi.fn>).mockImplementation(
      async (_key: string, _scope: string, hash: string) => ({ status: 'completed', response: cached, payloadHash: hash }),
    );
    const useCase = new ApproveRewardAwardUseCase(rewardRepo, makeHook(), auditService, authorizationService, idem, clock);
    const result = await useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', actor: am() });
    expect(result).toBe(cached);
    expect(rewardRepo.findById).not.toHaveBeenCalled();
  });

  it('rejects a replay with a mismatched payload (409)', async () => {
    const idem = makeIdempotency();
    (idem.tryAcquire as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'in_progress', payloadHash: 'other' });
    const useCase = new ApproveRewardAwardUseCase(
      makeRewardRepo(),
      makeHook(),
      auditService,
      authorizationService,
      idem,
      clock,
    );
    await expect(useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', actor: am() })).rejects.toBeInstanceOf(
      RewardAwardIdempotencyPayloadMismatchError,
    );
  });

  it('returns 409 when the same request is in progress', async () => {
    const idem = makeIdempotency();
    // Same payload hash → same request, but still running.
    (idem.tryAcquire as ReturnType<typeof vi.fn>).mockImplementation(async (_k: string, _s: string, hash: string) => ({
      status: 'in_progress',
      payloadHash: hash,
    }));
    const useCase = new ApproveRewardAwardUseCase(
      makeRewardRepo(),
      makeHook(),
      auditService,
      authorizationService,
      idem,
      clock,
    );
    await expect(useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', actor: am() })).rejects.toBeInstanceOf(
      RewardAwardIdempotencyInProgressError,
    );
  });

  it('forbids a non-AM/OP actor', async () => {
    const useCase = new ApproveRewardAwardUseCase(
      makeRewardRepo(),
      makeHook(),
      auditService,
      authorizationService,
      makeIdempotency(),
      clock,
    );
    await expect(
      useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', actor: am({ role: 'CL_ADMIN', tenantId: 't' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('VoidRewardAwardUseCase', () => {
  // Branch A: a not-yet-invoiced PENDING/APPROVED reward (AM/OP) voids the ledger entry.
  it.each<RewardAwardStatus>(['PENDING', 'APPROVED'])('voids a not-invoiced %s award with an inspector note', async (status) => {
    const rewardRepo = makeRewardRepo();
    (rewardRepo.findById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(buildAward({ status }))
      .mockResolvedValueOnce(
        buildAward({ status: 'VOID', voidedByUserId: 'user-am', voidedAt: NOW, voidReason: 'Agency rejected', inspectorNote: 'Sorry' }),
      );
    (rewardRepo.getStatusAndInvoice as ReturnType<typeof vi.fn>).mockResolvedValue({ status, inspectorInvoiceId: null });
    (rewardRepo.voidPendingOrApproved as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    const hook = makeHook();
    const useCase = new VoidRewardAwardUseCase(rewardRepo, hook, auditService, authorizationService, makeIdempotency(), clock);

    const result = await useCase.execute({
      awardId: 'award-1',
      idempotencyKey: 'k',
      reason: 'Agency rejected',
      inspectorNote: 'Sorry',
      actor: am({ role: 'OP' }),
    });

    expect(result.status).toBe('VOID');
    expect(rewardRepo.voidPendingOrApproved).toHaveBeenCalledWith('award-1', 'user-am', NOW, 'Agency rejected', 'Sorry', undefined);
    expect(rewardRepo.voidInvoiced).not.toHaveBeenCalled();
    expect(hook.onVoided).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reward_award.voided', after: expect.objectContaining({ afterInvoicing: false }) }),
    );
  });

  it('rejects voiding an already-VOID award (409)', async () => {
    const rewardRepo = makeRewardRepo();
    (rewardRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(buildAward({ status: 'VOID' }));
    const useCase = new VoidRewardAwardUseCase(rewardRepo, makeHook(), auditService, authorizationService, makeIdempotency(), clock);
    await expect(
      useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', reason: 'because', actor: am() }),
    ).rejects.toBeInstanceOf(RewardAwardInvalidStatusError);
    expect(rewardRepo.voidPendingOrApproved).not.toHaveBeenCalled();
    expect(rewardRepo.voidInvoiced).not.toHaveBeenCalled();
  });

  it('forbids OP from voiding an invoiced APPROVED reward (403)', async () => {
    const rewardRepo = makeRewardRepo();
    (rewardRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildAward({ status: 'APPROVED', inspectorInvoiceId: 'inv-1' }),
    );
    const useCase = new VoidRewardAwardUseCase(rewardRepo, makeHook(), auditService, authorizationService, makeIdempotency(), clock);
    await expect(
      useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', reason: 'because', actor: am({ role: 'OP' }) }),
    ).rejects.toBeInstanceOf(RewardAwardVoidRequiresAdminError);
    expect(rewardRepo.voidInvoiced).not.toHaveBeenCalled();
    expect(rewardRepo.voidPendingOrApproved).not.toHaveBeenCalled();
  });

  // Branch B: AM voids an invoiced/paid reward → reversal (voidInvoiced), afterInvoicing true.
  it.each<RewardAwardStatus>(['APPROVED', 'PAID'])('lets AM void an invoiced %s reward (reversal)', async (status) => {
    const rewardRepo = makeRewardRepo();
    (rewardRepo.findById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(buildAward({ status, inspectorInvoiceId: 'inv-1', paidAt: status === 'PAID' ? NOW : null }))
      .mockResolvedValueOnce(
        buildAward({ status: 'VOID', inspectorInvoiceId: 'inv-1', paidAt: status === 'PAID' ? NOW : null, voidedByUserId: 'user-am', voidedAt: NOW, voidReason: 'late data' }),
      );
    (rewardRepo.getStatusAndInvoice as ReturnType<typeof vi.fn>).mockResolvedValue({ status, inspectorInvoiceId: 'inv-1' });
    (rewardRepo.voidInvoiced as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    const hook = makeHook();
    const useCase = new VoidRewardAwardUseCase(rewardRepo, hook, auditService, authorizationService, makeIdempotency(), clock);

    const result = await useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', reason: 'late data', actor: am() });

    expect(result.status).toBe('VOID');
    expect(rewardRepo.voidInvoiced).toHaveBeenCalledWith('award-1', 'user-am', NOW, 'late data', null, undefined);
    expect(rewardRepo.voidPendingOrApproved).not.toHaveBeenCalled();
    expect(hook.onVoided).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reward_award.voided', after: expect.objectContaining({ afterInvoicing: true }) }),
    );
  });

  it('follows the reversal branch when a concurrent close invoices the reward (race)', async () => {
    const rewardRepo = makeRewardRepo();
    // Loaded BEFORE the close: not invoiced. The in-tx fresh read sees the committed link.
    (rewardRepo.findById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(buildAward({ status: 'APPROVED', inspectorInvoiceId: null }))
      .mockResolvedValueOnce(buildAward({ status: 'VOID', inspectorInvoiceId: 'inv-1', voidedByUserId: 'user-am', voidedAt: NOW }));
    (rewardRepo.getStatusAndInvoice as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'APPROVED', inspectorInvoiceId: 'inv-1' });
    (rewardRepo.voidInvoiced as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    const hook = makeHook();
    const useCase = new VoidRewardAwardUseCase(rewardRepo, hook, auditService, authorizationService, makeIdempotency(), clock);

    const result = await useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', reason: 'late data', actor: am() });

    expect(result.status).toBe('VOID');
    expect(rewardRepo.voidInvoiced).toHaveBeenCalledTimes(1);
    expect(rewardRepo.voidPendingOrApproved).not.toHaveBeenCalled();
  });

  it('passes a null inspector note through when none is given', async () => {
    const rewardRepo = makeRewardRepo();
    (rewardRepo.findById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(buildAward())
      .mockResolvedValueOnce(buildAward({ status: 'VOID', voidedByUserId: 'user-am', voidedAt: NOW, voidReason: 'x' }));
    (rewardRepo.getStatusAndInvoice as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'PENDING', inspectorInvoiceId: null });
    (rewardRepo.voidPendingOrApproved as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    const useCase = new VoidRewardAwardUseCase(
      rewardRepo,
      makeHook(),
      auditService,
      authorizationService,
      makeIdempotency(),
      clock,
    );
    await useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', reason: 'because', actor: am() });
    expect(rewardRepo.voidPendingOrApproved).toHaveBeenCalledWith('award-1', 'user-am', NOW, 'because', null, undefined);
  });

  it('forbids a non-AM/OP actor', async () => {
    const useCase = new VoidRewardAwardUseCase(
      makeRewardRepo(),
      makeHook(),
      auditService,
      authorizationService,
      makeIdempotency(),
      clock,
    );
    await expect(
      useCase.execute({ awardId: 'award-1', idempotencyKey: 'k', reason: 'because', actor: am({ role: 'INSP', inspectorId: 'i' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
