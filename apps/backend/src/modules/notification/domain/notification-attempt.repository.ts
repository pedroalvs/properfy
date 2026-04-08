import type { NotificationAttemptEntity } from './notification-attempt.entity';

export interface INotificationAttemptRepository {
  save(attempt: NotificationAttemptEntity): Promise<void>;
  update(attempt: NotificationAttemptEntity): Promise<void>;
  findByNotificationId(notificationId: string): Promise<NotificationAttemptEntity[]>;
}
