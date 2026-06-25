import type { PrismaClient } from '@prisma/client';
import type { NotificationAttemptStatus } from '@properfy/shared';
import { NotificationAttemptEntity } from '../domain/notification-attempt.entity';
import type { INotificationAttemptRepository } from '../domain/notification-attempt.repository';

function mapToEntity(row: any): NotificationAttemptEntity {
  return new NotificationAttemptEntity({
    id: row.id,
    notificationId: row.notification_id,
    attemptNumber: row.attempt_number,
    status: row.status as NotificationAttemptStatus,
    providerError: row.provider_error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
}

export class PrismaNotificationAttemptRepository implements INotificationAttemptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(attempt: NotificationAttemptEntity): Promise<void> {
    await this.prisma.notificationAttempt.create({
      data: {
        id: attempt.id,
        notification_id: attempt.notificationId,
        attempt_number: attempt.attemptNumber,
        status: attempt.status,
        provider_error: attempt.providerError,
        started_at: attempt.startedAt,
        finished_at: attempt.finishedAt,
      },
    });
  }

  async update(attempt: NotificationAttemptEntity): Promise<void> {
    await this.prisma.notificationAttempt.update({
      where: { id: attempt.id },
      data: {
        status: attempt.status,
        provider_error: attempt.providerError,
        finished_at: attempt.finishedAt,
      },
    });
  }

  async findByNotificationId(notificationId: string): Promise<NotificationAttemptEntity[]> {
    const rows = await this.prisma.notificationAttempt.findMany({
      where: { notification_id: notificationId },
      orderBy: { attempt_number: 'asc' },
    });
    return rows.map(mapToEntity);
  }
}
