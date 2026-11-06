import type { PrismaClient } from '@prisma/client';
import type { NotificationChannel, NotificationClass, ConsentChangeSource } from '@properfy/shared';
import { NotificationConsentEntity } from '../domain/notification-consent.entity';
import type {
  INotificationConsentRepository,
  ConsentScope,
  ListConsentsByRecipientParams,
  CountSkippedForRecipientParams,
} from '../domain/notification-consent.repository';

/**
 * Email is case-insensitive by identity, but the send pipeline compares
 * `notification.recipient` verbatim and contacts are stored as entered, so an
 * opt-out recorded for `Ana@x.com` silently failed to block a send to
 * `ana@x.com` (F06-2 fix). EMAIL recipients are therefore matched
 * **case-insensitively** at this one repository choke point — `findByScope`, the
 * `upsert` idempotency lookup and `listByRecipient` — which blocks regardless of
 * casing AND keeps any pre-F06-2 mixed-case row matching, with **no data
 * migration**. Phones (E.164) match exactly.
 *
 * The comparison is a **literal** `lower(trim())` equality done in memory over the
 * tenant+channel+class rows — deliberately NOT Prisma `mode: 'insensitive'`,
 * which compiles to `ILIKE` and would treat `_`/`%` in an email as wildcards
 * (cross-recipient matches, bulk `%` disclosure via `listByRecipient`, and a
 * wrong-row re-opt-in in `upsert`). Consent rows per tenant/channel/class are few
 * (opt-outs are rare), so the in-memory filter stays cheap.
 */
function isEmailChannel(channel: NotificationChannel | undefined, recipient: string): boolean {
  return channel === 'EMAIL' || (channel === undefined && recipient.includes('@'));
}

function normalizeEmail(recipient: string): string {
  return recipient.trim().toLowerCase();
}

function mapToEntity(row: any): NotificationConsentEntity {
  return new NotificationConsentEntity({
    id: row.id,
    recipient: row.recipient,
    channel: row.channel as NotificationChannel,
    tenantId: row.tenant_id,
    notificationClass: row.notification_class as NotificationClass,
    optedOut: row.opted_out,
    optedOutAt: row.opted_out_at,
    changeSource: (row.change_source ?? null) as ConsentChangeSource | null,
    changedAt: row.changed_at ?? null,
    changedByUserId: row.changed_by_user_id ?? null,
    reason: row.reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaNotificationConsentRepository implements INotificationConsentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Legacy lookup — returns the OPERATIONAL consent row for the tuple.
   * Preserved for the send-worker's existing call site; the send worker will migrate
   * to `findByScope` in feature 018 Wave 2.
   *
   * @deprecated Use `findByScope`.
   */
  async findByRecipientChannelTenant(
    recipient: string,
    channel: NotificationChannel,
    tenantId: string,
  ): Promise<NotificationConsentEntity | null> {
    return this.findByScope({
      tenantId,
      recipient,
      channel,
      notificationClass: 'OPERATIONAL',
    });
  }

  async findByScope(scope: ConsentScope): Promise<NotificationConsentEntity | null> {
    // A platform-scoped notification has no agency, and notification_consents
    // is keyed on a NOT NULL tenant_id — so no consent record can exist for it.
    // Answer that directly instead of asking Prisma for an impossible row.
    if (scope.tenantId === null) return null;

    if (scope.channel === 'EMAIL') {
      // Fail closed: an opted-out row wins if a legacy casing variant and a
      // canonical row both match the same address.
      const rows = await this.prisma.notificationConsent.findMany({
        where: {
          channel: 'EMAIL',
          tenant_id: scope.tenantId,
          notification_class: scope.notificationClass,
        },
        orderBy: [{ opted_out: 'desc' }],
      });
      const target = normalizeEmail(scope.recipient);
      const row = rows.find((r) => normalizeEmail(r.recipient) === target);
      return row ? mapToEntity(row) : null;
    }

    const row = await this.prisma.notificationConsent.findFirst({
      where: {
        recipient: scope.recipient,
        channel: scope.channel,
        tenant_id: scope.tenantId,
        notification_class: scope.notificationClass,
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async listByRecipient(params: ListConsentsByRecipientParams): Promise<NotificationConsentEntity[]> {
    if (isEmailChannel(params.channel, params.recipient)) {
      const rows = await this.prisma.notificationConsent.findMany({
        where: {
          tenant_id: params.tenantId,
          channel: 'EMAIL',
        },
        orderBy: [{ channel: 'asc' }, { notification_class: 'asc' }],
      });
      const target = normalizeEmail(params.recipient);
      return rows.filter((r) => normalizeEmail(r.recipient) === target).map(mapToEntity);
    }

    const rows = await this.prisma.notificationConsent.findMany({
      where: {
        tenant_id: params.tenantId,
        recipient: params.recipient,
        ...(params.channel ? { channel: params.channel } : {}),
      },
      orderBy: [{ channel: 'asc' }, { notification_class: 'asc' }],
    });
    return rows.map(mapToEntity);
  }

  async countSkippedForRecipient(params: CountSkippedForRecipientParams): Promise<number> {
    return this.prisma.notification.count({
      where: {
        tenant_id: params.tenantId,
        recipient: params.recipient,
        status: 'SKIPPED_OPT_OUT',
      },
    });
  }

  async findById(id: string): Promise<NotificationConsentEntity | null> {
    const row = await this.prisma.notificationConsent.findUnique({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async upsert(consent: NotificationConsentEntity): Promise<void> {
    const data = {
      opted_out: consent.optedOut,
      opted_out_at: consent.optedOutAt,
      change_source: consent.changeSource,
      changed_at: consent.changedAt,
      changed_by_user_id: consent.changedByUserId,
      reason: consent.reason,
    };

    // An entity whose row already exists (e.g. OverrideConsentUseCase loaded it by
    // id) is updated by primary key — never re-matched by recipient, so a casing
    // variant can never flip the wrong recipient's row.
    const byId = await this.prisma.notificationConsent.findUnique({
      where: { id: consent.id },
      select: { id: true },
    });
    if (byId) {
      await this.prisma.notificationConsent.update({ where: { id: byId.id }, data });
      return;
    }

    const existingId = await this.findExistingId(consent);
    if (existingId) {
      await this.prisma.notificationConsent.update({ where: { id: existingId }, data });
      return;
    }

    await this.prisma.notificationConsent.create({
      data: {
        id: consent.id,
        recipient: consent.recipient,
        channel: consent.channel,
        tenant_id: consent.tenantId,
        notification_class: consent.notificationClass,
        ...data,
      },
    });
  }

  /** The id of the existing row for this scope, matching EMAIL case-insensitively. */
  private async findExistingId(consent: NotificationConsentEntity): Promise<string | null> {
    if (consent.channel === 'EMAIL') {
      const rows = await this.prisma.notificationConsent.findMany({
        where: {
          channel: 'EMAIL',
          tenant_id: consent.tenantId,
          notification_class: consent.notificationClass,
        },
        select: { id: true, recipient: true },
        orderBy: [{ opted_out: 'desc' }],
      });
      const target = normalizeEmail(consent.recipient);
      return rows.find((r) => normalizeEmail(r.recipient) === target)?.id ?? null;
    }
    const existing = await this.prisma.notificationConsent.findFirst({
      where: {
        recipient: consent.recipient,
        channel: consent.channel,
        tenant_id: consent.tenantId,
        notification_class: consent.notificationClass,
      },
      select: { id: true },
    });
    return existing?.id ?? null;
  }
}
