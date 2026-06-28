import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaScheduleRecipientResolver } from '../../../src/modules/report/infrastructure/prisma-schedule-recipient-resolver';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';

function makeUser(overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {}) {
  const now = new Date();
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_ADMIN',
    name: 'Test User',
    email: 'user@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: 'hash',
    totpSecret: null,
    totpEnabled: false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  });
}

function makeSchedule(overrides: Partial<ConstructorParameters<typeof ScheduledReportEntity>[0]> = {}) {
  const now = new Date();
  return new ScheduledReportEntity({
    id: 'sched-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * *',
    displayName: 'Daily',
    deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [],
    skipDeliveryWhenEmpty: false,
    consecutiveFailureCount: 0,
    status: 'ACTIVE',
    deletedAt: null,
    lastRunAt: null,
    nextRunAt: now,
    createdByUserId: 'user-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeReport(overrides: Partial<ConstructorParameters<typeof ReportEntity>[0]> = {}) {
  const now = new Date();
  return new ReportEntity({
    id: 'report-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    status: 'READY',
    fileKey: 'reports/tenant-1/report-1.xlsx',
    requestedByUserId: 'user-1',
    scheduledReportId: 'sched-1',
    startedAt: now,
    completedAt: now,
    failedAt: null,
    errorMessage: null,
    rowCount: 10,
    expiresAt: new Date(now.getTime() + 30 * 86400000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeSut() {
  const userRepo: IUserManagementRepository = {
    findById: vi.fn(),
    findByIdAndTenantId: vi.fn(),
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
    findByTenantId: vi.fn(),
    countByTenantId: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    resetPassword: vi.fn(),
    unlock: vi.fn(),
    revokeAllSessions: vi.fn(),
  };
  const resolver = new PrismaScheduleRecipientResolver(userRepo);
  return { userRepo, resolver };
}

describe('PrismaScheduleRecipientResolver (feature 019)', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  // ─── OWNER_ONLY ─────────────────────────────────────────────────────────

  describe('OWNER_ONLY', () => {
    it('resolves the schedule owner as an active valid recipient', async () => {
      const schedule = makeSchedule({ deliveryMode: 'OWNER_ONLY', createdByUserId: 'user-1' });
      const report = makeReport();
      const owner = makeUser({ id: 'user-1', email: 'owner@example.com', name: 'Owner' });
      vi.mocked(sut.userRepo.findById).mockResolvedValue(owner);

      const result = await sut.resolver.resolve(schedule, report);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        userId: 'user-1',
        email: 'owner@example.com',
        name: 'Owner',
        accessValid: true,
      });
      expect(result[0].skipReason).toBeUndefined();
    });

    it('returns a not-found entry when the owner user does not exist', async () => {
      const schedule = makeSchedule({ deliveryMode: 'OWNER_ONLY', createdByUserId: 'ghost-id' });
      const report = makeReport();
      vi.mocked(sut.userRepo.findById).mockResolvedValue(null);

      const result = await sut.resolver.resolve(schedule, report);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        userId: 'ghost-id',
        email: null,
        name: null,
        accessValid: false,
        skipReason: 'user_not_found',
      });
    });

    it('marks the owner as invalid when their account is deactivated', async () => {
      const schedule = makeSchedule({ deliveryMode: 'OWNER_ONLY', createdByUserId: 'user-1' });
      const report = makeReport();
      const deactivated = makeUser({ id: 'user-1', status: 'DISABLED' as any });
      vi.mocked(sut.userRepo.findById).mockResolvedValue(deactivated);

      const result = await sut.resolver.resolve(schedule, report);

      expect(result[0].accessValid).toBe(false);
      expect(result[0].skipReason).toBe('owner_deactivated');
    });

    it('returns correct email and name fields on the resolved recipient', async () => {
      const schedule = makeSchedule({ deliveryMode: 'OWNER_ONLY', createdByUserId: 'user-1' });
      const report = makeReport();
      const owner = makeUser({ id: 'user-1', email: 'precise@example.com', name: 'Precise Name' });
      vi.mocked(sut.userRepo.findById).mockResolvedValue(owner);

      const result = await sut.resolver.resolve(schedule, report);

      expect(result[0].email).toBe('precise@example.com');
      expect(result[0].name).toBe('Precise Name');
    });
  });

  // ─── RECIPIENT_LIST ──────────────────────────────────────────────────────

  describe('RECIPIENT_LIST', () => {
    it('resolves each user ID in the recipient list', async () => {
      const schedule = makeSchedule({
        deliveryMode: 'RECIPIENT_LIST',
        recipientUserIds: ['u1', 'u2'],
      });
      const report = makeReport();
      vi.mocked(sut.userRepo.findById)
        .mockResolvedValueOnce(makeUser({ id: 'u1', email: 'u1@example.com', name: 'U1' }))
        .mockResolvedValueOnce(makeUser({ id: 'u2', email: 'u2@example.com', name: 'U2' }));

      const result = await sut.resolver.resolve(schedule, report);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ userId: 'u1', accessValid: true });
      expect(result[1]).toMatchObject({ userId: 'u2', accessValid: true });
    });

    it('returns an empty array when the recipient list is empty', async () => {
      const schedule = makeSchedule({ deliveryMode: 'RECIPIENT_LIST', recipientUserIds: [] });
      const report = makeReport();

      const result = await sut.resolver.resolve(schedule, report);

      expect(result).toHaveLength(0);
      expect(sut.userRepo.findById).not.toHaveBeenCalled();
    });

    it('includes a not-found entry for non-existent user IDs', async () => {
      const schedule = makeSchedule({
        deliveryMode: 'RECIPIENT_LIST',
        recipientUserIds: ['valid-id', 'missing-id'],
      });
      const report = makeReport();
      vi.mocked(sut.userRepo.findById)
        .mockResolvedValueOnce(makeUser({ id: 'valid-id', email: 'v@example.com', name: 'Valid' }))
        .mockResolvedValueOnce(null);

      const result = await sut.resolver.resolve(schedule, report);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ userId: 'valid-id', accessValid: true });
      expect(result[1]).toMatchObject({
        userId: 'missing-id',
        email: null,
        name: null,
        accessValid: false,
        skipReason: 'user_not_found',
      });
    });

    it('marks users without an email address as invalid', async () => {
      const schedule = makeSchedule({
        deliveryMode: 'RECIPIENT_LIST',
        recipientUserIds: ['no-email-user'],
      });
      const report = makeReport();
      vi.mocked(sut.userRepo.findById).mockResolvedValue(
        makeUser({ id: 'no-email-user', email: '', name: 'No Email', role: 'AM' }),
      );

      const result = await sut.resolver.resolve(schedule, report);

      expect(result[0].accessValid).toBe(false);
      expect(result[0].skipReason).toBe('no_email');
    });

    it('skips users from a different tenant', async () => {
      const schedule = makeSchedule({
        deliveryMode: 'RECIPIENT_LIST',
        recipientUserIds: ['other-tenant-user'],
        tenantId: 'tenant-1',
      });
      const report = makeReport();
      vi.mocked(sut.userRepo.findById).mockResolvedValue(
        makeUser({ id: 'other-tenant-user', tenantId: 'tenant-99' }),
      );

      const result = await sut.resolver.resolve(schedule, report);

      expect(result[0].accessValid).toBe(false);
      expect(result[0].skipReason).toBe('wrong_tenant');
    });
  });

  // ─── TENANT_WIDE ─────────────────────────────────────────────────────────

  describe('TENANT_WIDE', () => {
    it('resolves all active users in the tenant', async () => {
      const schedule = makeSchedule({ deliveryMode: 'TENANT_WIDE', tenantId: 'tenant-1' });
      const report = makeReport();
      const users = [
        makeUser({ id: 'u1', email: 'u1@example.com' }),
        makeUser({ id: 'u2', email: 'u2@example.com' }),
      ];
      vi.mocked(sut.userRepo.findByTenantId).mockResolvedValue(users);

      const result = await sut.resolver.resolve(schedule, report);

      expect(sut.userRepo.findByTenantId).toHaveBeenCalledWith(
        'tenant-1',
        { status: 'ACTIVE' },
        { page: 1, pageSize: 200, sortOrder: 'asc' },
      );
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.accessValid)).toBe(true);
    });

    it('returns an empty array when no active users exist in the tenant', async () => {
      const schedule = makeSchedule({ deliveryMode: 'TENANT_WIDE', tenantId: 'tenant-empty' });
      const report = makeReport();
      vi.mocked(sut.userRepo.findByTenantId).mockResolvedValue([]);

      const result = await sut.resolver.resolve(schedule, report);

      expect(result).toHaveLength(0);
    });
  });

  // ─── Permission rules ────────────────────────────────────────────────────

  describe('access-control rules', () => {
    it('grants AM access to restricted report types', async () => {
      const schedule = makeSchedule({
        deliveryMode: 'OWNER_ONLY',
        reportType: 'FINANCIAL_SERVICES',
        createdByUserId: 'am-user',
      });
      const report = makeReport({ reportType: 'FINANCIAL_SERVICES' });
      vi.mocked(sut.userRepo.findById).mockResolvedValue(
        makeUser({ id: 'am-user', role: 'AM', tenantId: null, email: 'am@example.com' }),
      );

      const result = await sut.resolver.resolve(schedule, report);

      expect(result[0].accessValid).toBe(true);
    });

    it('blocks CL_ADMIN from restricted report types', async () => {
      const schedule = makeSchedule({
        deliveryMode: 'OWNER_ONLY',
        reportType: 'FINANCIAL_SERVICES',
        createdByUserId: 'cl-admin',
      });
      const report = makeReport({ reportType: 'FINANCIAL_SERVICES' });
      vi.mocked(sut.userRepo.findById).mockResolvedValue(
        makeUser({ id: 'cl-admin', role: 'CL_ADMIN', email: 'cl@example.com' }),
      );

      const result = await sut.resolver.resolve(schedule, report);

      expect(result[0].accessValid).toBe(false);
      expect(result[0].skipReason).toBe('restricted_report_type');
    });

    it('blocks INSP role from receiving any report', async () => {
      const schedule = makeSchedule({ deliveryMode: 'OWNER_ONLY', createdByUserId: 'insp-user' });
      const report = makeReport();
      vi.mocked(sut.userRepo.findById).mockResolvedValue(
        makeUser({ id: 'insp-user', role: 'INSP', email: 'insp@example.com' }),
      );

      const result = await sut.resolver.resolve(schedule, report);

      expect(result[0].accessValid).toBe(false);
      expect(result[0].skipReason).toBe('missing_permission');
    });
  });
});
