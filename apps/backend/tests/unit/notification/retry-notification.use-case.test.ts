import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryNotificationUseCase } from '../../../src/modules/notification/application/use-cases/retry-notification.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import {
  NotificationEntity,
  type NotificationProps,
} from '../../../src/modules/notification/domain/notification.entity';
import {
  NotificationNotFoundError,
  NotificationInvalidStatusError,
  NotificationForbiddenError,
} from '../../../src/modules/notification/domain/notification.errors';
import type { AuditService } from '../../../src/modules/notification/../../../shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

const now = new Date('2026-03-16T10:00:00.000Z');

function makeNotification(overrides: Partial<NotificationProps> = {}): NotificationEntity {
  const defaults: NotificationProps = {
    id: 'notif-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    recipient: 'user@example.com',
    channel: 'EMAIL',
    templateCode: 'INSPECTION_NOTICE',
    status: 'FAILED',
    providerName: 'resend',
    providerMessageId: 'msg-1',
    sentAt: null,
    deliveredAt: null,
    failedAt: now,
    failureReason: 'Connection refused',
    payloadJson: { tenantName: 'John' },
    retryCount: 6,
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

function makeSut() {
  const notificationRepo: INotificationRepository = {
    findById: vi.fn(),
    findByProviderMessageId: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };
  const auditService: AuditService = {
    log: vi.fn(),
  } as unknown as AuditService;

  const useCase = new RetryNotificationUseCase(notificationRepo, auditService);
  return { notificationRepo, auditService, useCase };
}

describe('RetryNotificationUseCase', () => {
  let notificationRepo: INotificationRepository;
  let auditService: AuditService;
  let useCase: RetryNotificationUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    notificationRepo = sut.notificationRepo;
    auditService = sut.auditService;
    useCase = sut.useCase;
  });

  it('should throw NotificationForbiddenError for non-AM/OP roles', async () => {
    await expect(
      useCase.execute({
        notificationId: 'notif-1',
        actor: makeActor({ role: 'CL_ADMIN' }),
      }),
    ).rejects.toThrow(NotificationForbiddenError);

    await expect(
      useCase.execute({
        notificationId: 'notif-1',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(NotificationForbiddenError);

    await expect(
      useCase.execute({
        notificationId: 'notif-1',
        actor: makeActor({ role: 'CL_USER' }),
      }),
    ).rejects.toThrow(NotificationForbiddenError);
  });

  it('should throw NotificationNotFoundError when not found', async () => {
    vi.mocked(notificationRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        notificationId: 'notif-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(NotificationNotFoundError);
  });

  it('should throw NotificationInvalidStatusError when status is not FAILED', async () => {
    vi.mocked(notificationRepo.findById).mockResolvedValue(
      makeNotification({ status: 'PENDING' }),
    );

    await expect(
      useCase.execute({
        notificationId: 'notif-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(NotificationInvalidStatusError);
  });

  it('should reset notification to PENDING and return output', async () => {
    const notification = makeNotification();
    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);

    const result = await useCase.execute({
      notificationId: 'notif-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.notificationId).toBe('notif-1');
    expect(result.status).toBe('PENDING');
    expect(result.retriedAt).toBeDefined();

    const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
    expect(updated.status).toBe('PENDING');
    expect(updated.retryCount).toBe(0);
    expect(updated.nextRetryAt).toBeNull();
    expect(updated.failedAt).toBeNull();
    expect(updated.failureReason).toBeNull();
  });

  it('should allow OP role to retry', async () => {
    const notification = makeNotification();
    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);

    const result = await useCase.execute({
      notificationId: 'notif-1',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.status).toBe('PENDING');
  });

  it('should call audit log', async () => {
    const notification = makeNotification();
    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);

    await useCase.execute({
      notificationId: 'notif-1',
      actor: makeActor({ role: 'AM', userId: 'admin-1' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NOTIFICATION_MANUALLY_RETRIED',
        actorType: 'USER',
        actorId: 'admin-1',
        entityType: 'NOTIFICATION',
        entityId: 'notif-1',
        tenantId: 'tenant-1',
      }),
    );
  });
});
