import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetNotificationUseCase } from '../../../src/modules/notification/application/use-cases/get-notification.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import { NotificationEntity, type NotificationProps } from '../../../src/modules/notification/domain/notification.entity';
import { NotificationNotFoundError } from '../../../src/modules/notification/domain/notification.errors';
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
    status: 'SENT',
    providerName: 'resend',
    providerMessageId: 'msg-abc-123',
    sentAt: new Date('2026-03-16T10:05:00.000Z'),
    deliveredAt: new Date('2026-03-16T10:06:00.000Z'),
    failedAt: null,
    failureReason: null,
    payloadJson: { rentalTenantName: 'John', propertyAddress: '123 Main St' },
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
  const useCase = new GetNotificationUseCase(notificationRepo, authorizationService);
  return { notificationRepo, useCase };
}

describe('GetNotificationUseCase', () => {
  let notificationRepo: INotificationRepository;
  let useCase: GetNotificationUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    notificationRepo = sut.notificationRepo;
    useCase = sut.useCase;
  });

  it('should throw ForbiddenError for CL_ADMIN role', async () => {
    await expect(
      useCase.execute({
        notificationId: 'notif-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute({
        notificationId: 'notif-1',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError for CL_USER role', async () => {
    await expect(
      useCase.execute({
        notificationId: 'notif-1',
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw NotificationNotFoundError when not found', async () => {
    vi.mocked(notificationRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        notificationId: 'nonexistent',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(NotificationNotFoundError);
  });

  it('should return full notification detail for AM', async () => {
    const notification = makeNotification();
    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);

    const result = await useCase.execute({
      notificationId: 'notif-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.id).toBe('notif-1');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.appointmentId).toBe('appt-1');
    expect(result.recipient).toBe('tenant@example.com');
    expect(result.channel).toBe('EMAIL');
    expect(result.templateCode).toBe('INSPECTION_NOTICE');
    expect(result.status).toBe('SENT');
    expect(result.retryCount).toBe(0);
    expect(notificationRepo.findById).toHaveBeenCalledWith('notif-1');
  });

  it('should return full notification detail for OP', async () => {
    vi.mocked(notificationRepo.findById).mockResolvedValue(makeNotification());

    const result = await useCase.execute({
      notificationId: 'notif-1',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.id).toBe('notif-1');
    expect(result.tenantId).toBe('tenant-1');
  });

  it('should include payloadJson in output', async () => {
    const payloadJson = { rentalTenantName: 'John', propertyAddress: '123 Main St' };
    vi.mocked(notificationRepo.findById).mockResolvedValue(
      makeNotification({ payloadJson }),
    );

    const result = await useCase.execute({
      notificationId: 'notif-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.payloadJson).toEqual({ rentalTenantName: 'John', propertyAddress: '123 Main St' });
  });

  it('should include providerMessageId in output', async () => {
    vi.mocked(notificationRepo.findById).mockResolvedValue(
      makeNotification({ providerMessageId: 'msg-xyz-789' }),
    );

    const result = await useCase.execute({
      notificationId: 'notif-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.providerMessageId).toBe('msg-xyz-789');
  });

  it('should format all date fields as ISO strings or null', async () => {
    const sentAt = new Date('2026-03-16T11:00:00.000Z');
    const deliveredAt = new Date('2026-03-16T11:05:00.000Z');
    const createdAt = new Date('2026-03-16T10:00:00.000Z');
    const updatedAt = new Date('2026-03-16T12:00:00.000Z');
    const nextRetryAt = new Date('2026-03-16T13:00:00.000Z');

    vi.mocked(notificationRepo.findById).mockResolvedValue(
      makeNotification({
        sentAt,
        deliveredAt,
        failedAt: null,
        nextRetryAt,
        createdAt,
        updatedAt,
      }),
    );

    const result = await useCase.execute({
      notificationId: 'notif-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.sentAt).toBe('2026-03-16T11:00:00.000Z');
    expect(result.deliveredAt).toBe('2026-03-16T11:05:00.000Z');
    expect(result.failedAt).toBeNull();
    expect(result.nextRetryAt).toBe('2026-03-16T13:00:00.000Z');
    expect(result.createdAt).toBe('2026-03-16T10:00:00.000Z');
    expect(result.updatedAt).toBe('2026-03-16T12:00:00.000Z');
  });
});
