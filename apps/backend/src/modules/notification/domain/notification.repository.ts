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
  /**
   * PENDING rows whose enqueue was lost (retry_count = 0, next_retry_at NULL)
   * created before `cutoff` — invisible to findRetryable, so the retry-poll
   * self-heals them (mirrors the geocoding self-heal pattern).
   */
  findStuckPending(cutoff: Date, limit?: number): Promise<NotificationEntity[]>;
  /**
   * SENT SMS rows with a providerMessageId whose sent_at falls in [from, to] —
   * candidates for delivery-status reconciliation against the provider.
   */
  findSmsAwaitingDeliveryReceipt(from: Date, to: Date, limit?: number): Promise<NotificationEntity[]>;
  save(notification: NotificationEntity): Promise<void>;
  /** Atomically inserts by notification ID; false means that ID already exists. */
  saveIfAbsent(notification: NotificationEntity): Promise<boolean>;
  update(notification: NotificationEntity): Promise<void>;
  /**
   * Replaces the given payload_json keys (when present) with `replacement`,
   * atomically in the database. Used to redact secret-bearing values after the
   * payload can no longer be re-rendered for sending. Scoped by tenant.
   */
  scrubPayload(
    id: string,
    tenantId: string | null,
    keys: readonly string[],
    replacement: string,
  ): Promise<void>;
  /** Lifetime dedupe scoped by both appointment and tenant. */
  existsByAppointmentAndTemplate(
    appointmentId: string,
    templateCode: string,
    tenantId: string,
  ): Promise<boolean>;
  /**
   * Most recently created notification for the appointment among `templateCodes`,
   * or null when none exists. Backs occurrence-scoped dedupe — "what was the
   * rental tenant last told?" — as opposed to the lifetime guard of
   * `existsByAppointmentAndTemplate`. Scoped by tenant.
   */
  findLatestByAppointmentAndTemplates(
    appointmentId: string,
    tenantId: string,
    templateCodes: readonly string[],
  ): Promise<NotificationEntity | null>;
  /**
   * Whether the appointment has EVER produced a notification under any of
   * `templateCodes`. Lifetime semantics like `existsByAppointmentAndTemplate`,
   * but over a family — answers "was the rental tenant ever told about this
   * inspection?", which is a different question from the occurrence-scoped
   * "what were they last told?" that `findLatestByAppointmentAndTemplates`
   * answers for the dedupe. Kept separate so the two cannot drift into each
   * other. Scoped by tenant.
   */
  existsByAppointmentAndTemplates(
    appointmentId: string,
    tenantId: string,
    templateCodes: readonly string[],
  ): Promise<boolean>;
  countByTenantChannelSince(tenantId: string | null, channel: NotificationChannel, since: Date): Promise<number>;
}
