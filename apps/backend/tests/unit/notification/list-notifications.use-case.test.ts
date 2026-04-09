import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListNotificationsUseCase } from '../../../src/modules/notification/application/use-cases/list-notifications.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import { NotificationEntity, type NotificationProps } from '../../../src/modules/notification/domain/notification.entity';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeNotification(overrides: Partial<NotificationProps> = {}): NotificationEntity {
  const now = new Date('2026-03-16T10:00:00.000Z');
  const defaults: NotificationProps = {
    id: 'notif-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    recipient: 'tenant@example.com',
    channel: 'EMAIL',
    templateCode: 'INSPECTION_NOTICE',
    status: 'PENDING',
    providerName: null,
    providerMessageId: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    payloadJson: { tenantName: 'John' },
    retryCount: 0,
    nextRetryAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return new NotificationEntity({ ...defaults, ...overrides });
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

function makeAuthorizationService() {
  return new AuthorizationService({ log: vi.fn() } as never);
}

function makeSut() {
  const notificationRepo: INotificationRepository = {
    findById: vi.fn(),
    findByProviderMessageId: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };
  const authorizationService = makeAuthorizationService();
  const useCase = new ListNotificationsUseCase(notificationRepo, authorizationService);
  return { notificationRepo, useCase };
}

const defaultInput = {
  page: 1,
  pageSize: 10,
  sortBy: 'createdAt',
  sortOrder: 'desc' as const,
};

describe('ListNotificationsUseCase', () => {
  let notificationRepo: INotificationRepository;
  let useCase: ListNotificationsUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    notificationRepo = sut.notificationRepo;
    useCase = sut.useCase;
  });

  it('should throw ForbiddenError for CL_ADMIN role', async () => {
    await expect(
      useCase.execute({
        ...defaultInput,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute({
        ...defaultInput,
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should allow AM to list all notifications', async () => {
    const notifications = [makeNotification(), makeNotification({ id: 'notif-2' })];
    vi.mocked(notificationRepo.findAll).mockResolvedValue(notifications);
    vi.mocked(notificationRepo.count).mockResolvedValue(2);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(notificationRepo.findAll).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  it('should allow OP to list notifications', async () => {
    vi.mocked(notificationRepo.findAll).mockResolvedValue([makeNotification()]);
    vi.mocked(notificationRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should pass tenantId filter when provided', async () => {
    vi.mocked(notificationRepo.findAll).mockResolvedValue([]);
    vi.mocked(notificationRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      tenantId: 'tenant-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(notificationRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
  });

  it('should pass all filters (channel, status, templateCode, appointmentId, fromDate, toDate)', async () => {
    vi.mocked(notificationRepo.findAll).mockResolvedValue([]);
    vi.mocked(notificationRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      channel: 'EMAIL',
      status: 'SENT',
      templateCode: 'INSPECTION_NOTICE',
      appointmentId: 'appt-1',
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
      actor: makeActor({ role: 'AM' }),
    });

    expect(notificationRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'EMAIL',
        status: 'SENT',
        templateCode: 'INSPECTION_NOTICE',
        appointmentId: 'appt-1',
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
      }),
      expect.any(Object),
    );
  });

  it('should return paginated result with total', async () => {
    vi.mocked(notificationRepo.findAll).mockResolvedValue([makeNotification()]);
    vi.mocked(notificationRepo.count).mockResolvedValue(25);

    const result = await useCase.execute({
      page: 3,
      pageSize: 5,
      sortBy: 'sentAt',
      sortOrder: 'asc',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.total).toBe(25);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(5);
    expect(notificationRepo.findAll).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ page: 3, pageSize: 5, sortBy: 'sentAt', sortOrder: 'asc' }),
    );
  });

  it('should return empty data array when no notifications found', async () => {
    vi.mocked(notificationRepo.findAll).mockResolvedValue([]);
    vi.mocked(notificationRepo.count).mockResolvedValue(0);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should format dates as ISO strings (sentAt, deliveredAt, failedAt, createdAt)', async () => {
    const sentAt = new Date('2026-03-16T11:00:00.000Z');
    const deliveredAt = new Date('2026-03-16T11:05:00.000Z');
    const failedAt = new Date('2026-03-16T11:10:00.000Z');
    const createdAt = new Date('2026-03-16T10:00:00.000Z');

    vi.mocked(notificationRepo.findAll).mockResolvedValue([
      makeNotification({ sentAt, deliveredAt, failedAt, createdAt }),
    ]);
    vi.mocked(notificationRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data[0].sentAt).toBe('2026-03-16T11:00:00.000Z');
    expect(result.data[0].deliveredAt).toBe('2026-03-16T11:05:00.000Z');
    expect(result.data[0].failedAt).toBe('2026-03-16T11:10:00.000Z');
    expect(result.data[0].createdAt).toBe('2026-03-16T10:00:00.000Z');
  });

  it('should return null for optional date fields when not set', async () => {
    vi.mocked(notificationRepo.findAll).mockResolvedValue([
      makeNotification({ sentAt: null, deliveredAt: null, failedAt: null }),
    ]);
    vi.mocked(notificationRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data[0].sentAt).toBeNull();
    expect(result.data[0].deliveredAt).toBeNull();
    expect(result.data[0].failedAt).toBeNull();
  });
});
