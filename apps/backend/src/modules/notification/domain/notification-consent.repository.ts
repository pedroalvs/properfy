import type { NotificationConsentEntity } from './notification-consent.entity';
import type { NotificationChannel, NotificationClass } from '@properfy/shared';

/**
 * Scope key that uniquely identifies a consent record per feature 018:
 * consent is tracked per (tenant, recipient, channel, notificationClass).
 */
export interface ConsentScope {
  tenantId: string;
  recipient: string;
  channel: NotificationChannel;
  notificationClass: NotificationClass;
}

export interface ListConsentsByRecipientParams {
  tenantId: string;
  recipient: string;
  channel?: NotificationChannel;
}

export interface CountSkippedForRecipientParams {
  tenantId: string;
  recipient: string;
}

export interface INotificationConsentRepository {
  /**
   * Legacy lookup retained for backward compatibility with the existing send worker.
   * Returns the OPERATIONAL consent row for the given recipient/channel/tenant (the
   * only class that had a record before feature 018).
   *
   * @deprecated Use `findByScope` with an explicit notificationClass instead.
   */
  findByRecipientChannelTenant(
    recipient: string,
    channel: NotificationChannel,
    tenantId: string,
  ): Promise<NotificationConsentEntity | null>;

  /**
   * Feature 018: scope-aware lookup. Returns the consent record for the exact
   * (tenantId, recipient, channel, notificationClass) tuple, or null if none exists
   * (which the send worker treats as "opted in").
   */
  findByScope(scope: ConsentScope): Promise<NotificationConsentEntity | null>;

  /**
   * Feature 018: operator lookup — returns all consent records for a recipient
   * within a tenant, optionally narrowed by channel.
   */
  listByRecipient(params: ListConsentsByRecipientParams): Promise<NotificationConsentEntity[]>;

  /**
   * Feature 018: count of notifications skipped for this recipient due to consent.
   * Queries the `notifications` table for status = 'SKIPPED_OPT_OUT'.
   */
  countSkippedForRecipient(params: CountSkippedForRecipientParams): Promise<number>;

  /**
   * Lookup by primary key (needed by operator override flow).
   */
  findById(id: string): Promise<NotificationConsentEntity | null>;

  upsert(consent: NotificationConsentEntity): Promise<void>;
}
