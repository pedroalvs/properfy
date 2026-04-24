import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApproveFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/approve-financial-entry.use-case';
import { FinancialEntryEntity } from '../../../src/modules/billing/domain/financial-entry.entity';
import {
  EntryNotFoundError,
  EntryNotPendingError,
} from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

const financialEntryRepo = {
  findById: vi.fn(),
  findByIdEnriched: vi.fn(),
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

const authorizationService = new AuthorizationService(auditService as any);

function makeSut() {
  return new ApproveFinancialEntryUseCase(financialEntryRepo, auditService as any, authorizationService);
}

function makeApprovedEnrichedEntry(entry: FinancialEntryEntity, approvedByUserId: string, approvedAt: Date) {
  return {
    entity: new FinancialEntryEntity({
      ...entry,
      status: 'APPROVED' as const,
      approvedByUserId,
      approvedAt,
    }),
    appointmentCode: 'INS-2026-0001',
    relatedEntityName: 'Test Agency',
    approvedByName: 'Test Approver',
  };
}

describe('ApproveFinancialEntryUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const pendingEntry = makePendingEntry();
    financialEntryRepo.findById.mockResolvedValue(pendingEntry);
    financialEntryRepo.transitionStatus.mockResolvedValue(undefined);
    financialEntryRepo.findByIdEnriched.mockImplementation(async () => {
      return makeApprovedEnrichedEntry(pendingEntry, 'op-1', new Date());
    });
  });

  it('should return full enriched entity with status APPROVED after approval', async () => {
    const sut = makeSut();

    const result = await sut.execute({ entryId: 'entry-1', actor: opActor });

    expect(result.id).toBe('entry-1');
    expect(result.status).toBe('APPROVED');
    expect(result.approvedByUserId).toBe('op-1');
    expect(typeof result.approvedAt).toBe('string');
    // Full entity fields must be present
    expect(result.tenantId).toBe('tenant-1');
    expect(result.entryType).toBe('INSPECTOR_PAYOUT');
    expect(result.amount).toBe(140);
    expect(result.currency).toBe('AUD');
    // Enriched fields
    expect(result.appointmentCode).toBe('INS-2026-0001');
    expect(result.relatedEntityName).toBe('Test Agency');
    expect(result.approvedByName).toBe('Test Approver');

    expect(financialEntryRepo.transitionStatus).toHaveBeenCalledWith(
      'entry-1',
      'tenant-1',
      'PENDING',
      'APPROVED',
      'op-1',
      expect.any(Date),
    );
    expect(financialEntryRepo.findByIdEnriched).toHaveBeenCalledWith('entry-1', 'tenant-1');
  });

  it('should allow AM to approve entries', async () => {
    const pendingEntry = makePendingEntry();
    financialEntryRepo.findByIdEnriched.mockResolvedValueOnce(
      makeApprovedEnrichedEntry(pendingEntry, 'am-1', new Date()),
    );
    const sut = makeSut();

    const result = await sut.execute({ entryId: 'entry-1', actor: amActor });

    expect(result.status).toBe('APPROVED');
    expect(result.approvedByUserId).toBe('am-1');
  });

  it('should reject self-approval', async () => {
    const sut = makeSut();
    financialEntryRepo.findById.mockResolvedValue(
      makePendingEntry({ initiatedByUserId: 'op-1' }),
    );

    await expect(
      sut.execute({ entryId: 'entry-1', actor: opActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject non-PENDING entry', async () => {
    const sut = makeSut();
    financialEntryRepo.findById.mockResolvedValue(
      makePendingEntry({ status: 'APPROVED' }),
    );

    await expect(
      sut.execute({ entryId: 'entry-1', actor: opActor }),
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
      sut.execute({ entryId: 'entry-1', actor: clientActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject when entry not found', async () => {
    const sut = makeSut();
    financialEntryRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ entryId: 'nonexistent', actor: opActor }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('should audit log the approval', async () => {
    const sut = makeSut();

    await sut.execute({ entryId: 'entry-1', actor: opActor });

    expect(auditService.log).toHaveBeenCalledOnce();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'financial_entry.approved',
        actorType: 'USER',
        actorId: 'op-1',
        entityType: 'FinancialEntry',
        entityId: 'entry-1',
        tenantId: 'tenant-1',
        before: { status: 'PENDING' },
        after: expect.objectContaining({ status: 'APPROVED', approvedBy: 'op-1' }),
      }),
    );
  });
});
