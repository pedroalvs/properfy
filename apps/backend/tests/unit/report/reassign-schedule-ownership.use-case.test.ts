import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReassignScheduleOwnershipUseCase } from '../../../src/modules/report/application/use-cases/reassign-schedule-ownership.use-case';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import {
  ScheduleForbiddenReassignmentError,
  ScheduledReportNotFoundError,
  IncompatibleOwnershipError,
} from '../../../src/modules/report/domain/report.errors';
import type { AuthContext } from '@properfy/shared';

const SCHEDULE_ID = '11111111-2222-3333-4444-555555555555';
const NEW_OWNER_ID = '99999999-8888-7777-6666-555555555555';

function makeSchedule(overrides: Partial<ConstructorParameters<typeof ScheduledReportEntity>[0]> = {}) {
  const now = new Date();
  return new ScheduledReportEntity({
    id: SCHEDULE_ID,
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * *',
    displayName: null,
    deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [],
    skipDeliveryWhenEmpty: false,
    consecutiveFailureCount: 0,
    status: 'ACTIVE',
    deletedAt: null,
    lastRunAt: null,
    nextRunAt: now,
    createdByUserId: 'old-owner',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeUser(overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {}) {
  const now = new Date();
  return new UserEntity({
    id: NEW_OWNER_ID,
    tenantId: 'tenant-1',
    branchId: null,
    role: 'OP',
    name: 'Target User',
    email: 'target@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: 'hash',
    totpEnabled: false,
    totpSecretCiphertext: null,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  } as any);
}

function makeAuth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'am-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    clUserPermissions: [],
    ...overrides,
  };
}

function makeSut() {
  const scheduleRepo: IScheduledReportRepository = {
    findById: vi.fn(),
    findByIdIncludingDeleted: vi.fn(),
    findDueForProcessing: vi.fn(),
    findDueSchedules: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    countActiveByOwner: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };
  const userRepo: IUserManagementRepository = {
    findById: vi.fn(),
    findByIdAndTenantId: vi.fn(),
    findByEmail: vi.fn(),
    findByTenantId: vi.fn(),
    countByTenantId: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    resetPassword: vi.fn(),
    unlock: vi.fn(),
    revokeAllSessions: vi.fn(),
  };
  const auditService: AuditService = { log: vi.fn() };
  const useCase = new ReassignScheduleOwnershipUseCase(scheduleRepo, userRepo, auditService);
  return { scheduleRepo, userRepo, auditService, useCase };
}

describe('ReassignScheduleOwnershipUseCase (feature 019 US5)', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('allows AM to reassign a schedule to a compatible user', async () => {
    vi.mocked(sut.scheduleRepo.findById).mockResolvedValue(makeSchedule());
    vi.mocked(sut.userRepo.findById).mockResolvedValue(makeUser());

    const result = await sut.useCase.execute(
      { scheduleId: SCHEDULE_ID, newOwnerUserId: NEW_OWNER_ID, reason: 'owner left' },
      makeAuth(),
    );

    expect(result.createdByUserId).toBe(NEW_OWNER_ID);
    expect(sut.scheduleRepo.update).toHaveBeenCalledOnce();
    expect(sut.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scheduledReportOwnershipReassigned',
        reason: 'owner left',
        before: { ownerUserId: 'old-owner' },
        after: { ownerUserId: NEW_OWNER_ID },
      }),
    );
  });

  it('rejects non-AM actors with ScheduleForbiddenReassignmentError', async () => {
    await expect(
      sut.useCase.execute(
        { scheduleId: SCHEDULE_ID, newOwnerUserId: NEW_OWNER_ID, reason: 'test' },
        makeAuth({ role: 'OP', tenantId: 'tenant-1' }),
      ),
    ).rejects.toThrow(ScheduleForbiddenReassignmentError);

    expect(sut.scheduleRepo.update).not.toHaveBeenCalled();
  });

  it('rejects when the schedule does not exist', async () => {
    vi.mocked(sut.scheduleRepo.findById).mockResolvedValue(null);

    await expect(
      sut.useCase.execute(
        { scheduleId: SCHEDULE_ID, newOwnerUserId: NEW_OWNER_ID, reason: 'test' },
        makeAuth(),
      ),
    ).rejects.toThrow(ScheduledReportNotFoundError);
  });

  it('rejects when the target user does not exist', async () => {
    vi.mocked(sut.scheduleRepo.findById).mockResolvedValue(makeSchedule());
    vi.mocked(sut.userRepo.findById).mockResolvedValue(null);

    await expect(
      sut.useCase.execute(
        { scheduleId: SCHEDULE_ID, newOwnerUserId: NEW_OWNER_ID, reason: 'test' },
        makeAuth(),
      ),
    ).rejects.toThrow(IncompatibleOwnershipError);
  });

  it('rejects when the target user is deactivated', async () => {
    vi.mocked(sut.scheduleRepo.findById).mockResolvedValue(makeSchedule());
    vi.mocked(sut.userRepo.findById).mockResolvedValue(makeUser({ status: 'DISABLED' } as any));

    await expect(
      sut.useCase.execute(
        { scheduleId: SCHEDULE_ID, newOwnerUserId: NEW_OWNER_ID, reason: 'test' },
        makeAuth(),
      ),
    ).rejects.toThrow(IncompatibleOwnershipError);
  });

  it('rejects when the target user is in a different tenant', async () => {
    vi.mocked(sut.scheduleRepo.findById).mockResolvedValue(makeSchedule());
    vi.mocked(sut.userRepo.findById).mockResolvedValue(makeUser({ tenantId: 'tenant-other' }));

    await expect(
      sut.useCase.execute(
        { scheduleId: SCHEDULE_ID, newOwnerUserId: NEW_OWNER_ID, reason: 'test' },
        makeAuth(),
      ),
    ).rejects.toThrow(IncompatibleOwnershipError);
  });

  it('rejects when the target user cannot access a restricted report type', async () => {
    vi.mocked(sut.scheduleRepo.findById).mockResolvedValue(
      makeSchedule({ reportType: 'INSPECTOR_PERFORMANCE' }),
    );
    vi.mocked(sut.userRepo.findById).mockResolvedValue(makeUser({ role: 'CL_USER' }));

    await expect(
      sut.useCase.execute(
        { scheduleId: SCHEDULE_ID, newOwnerUserId: NEW_OWNER_ID, reason: 'test' },
        makeAuth(),
      ),
    ).rejects.toThrow(IncompatibleOwnershipError);
  });

  it('rejects INSP and TNT target roles even for non-restricted reports', async () => {
    vi.mocked(sut.scheduleRepo.findById).mockResolvedValue(makeSchedule());
    vi.mocked(sut.userRepo.findById).mockResolvedValue(makeUser({ role: 'INSP' }));

    await expect(
      sut.useCase.execute(
        { scheduleId: SCHEDULE_ID, newOwnerUserId: NEW_OWNER_ID, reason: 'test' },
        makeAuth(),
      ),
    ).rejects.toThrow(IncompatibleOwnershipError);
  });
});
