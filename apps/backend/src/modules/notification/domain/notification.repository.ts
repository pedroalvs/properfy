import type { NotificationEntity } from './notification.entity';
import type { NotificationChannel, NotificationStatus } from '@properfy/shared';

export interface NotificationFilters {
  tenantId?: string;
  appointmentId?: string;
  channel?: NotificationChannel;
  status?: NotificationStatus;
  templateCode?: string;
  fromDate?: string;
  toDate?: string;
}

export interface NotificationPagination {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface INotificationRepository {
  findById(id: string): Promise<NotificationEntity | null>;
  findByProviderMessageId(providerMessageId: string): Promise<NotificationEntity | null>;
  findAll(filters: NotificationFilters, pagination: NotificationPagination): Promise<NotificationEntity[]>;
  count(filters: NotificationFilters): Promise<number>;
  findRetryable(now: Date, limit?: number): Promise<NotificationEntity[]>;
  save(notification: NotificationEntity): Promise<void>;
  update(notification: NotificationEntity): Promise<void>;
  existsByAppointmentAndTemplate(appointmentId: string, templateCode: string): Promise<boolean>;
  countByTenantChannelSince(tenantId: string, channel: NotificationChannel, since: Date): Promise<number>;
}
