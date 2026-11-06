import {
  type NotificationChannel,
  type TenantEtaNoticesSetting,
  type ProjectedStop,
  type EtaPlanStop,
  isTenantEtaNoticesEnabled,
  isRentalTenantNotificationsEnabled,
  suppressesOccupantNotifications,
  toE164Au,
  zonedWallTimeToUtc,
  TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES,
} from '@properfy/shared';
import type { Logger } from '../../../shared/infrastructure/logger';
import type { INotificationRepository } from '../../notification/domain/notification.repository';
import type {
  CreateNotificationUseCase,
} from '../../notification/application/use-cases/create-notification.use-case';
import type { BuildNotificationPayloadService } from '../../notification/domain/build-notification-payload.service';
import type { AppointmentCodeFormatter } from '../../appointment/domain/appointment-code.formatter';
import type { AppointmentWithRelations } from '../../appointment/domain/appointment.repository';
import type { TenantEntity } from '../../tenant/domain/tenant.entity';
import { TENANT_ETA_TEMPLATE_CODES, type TenantEtaKind } from '../domain/tenant-eta.constants';
import type { TenantEtaStopMeta } from '../domain/tenant-eta-plan.reader';
import { formatEtaBand, wallTimeHHmm, type EtaBand } from '../domain/eta-band';
import { getTenantEtaNotificationId } from '../domain/tenant-eta-notification-id';

/**
 * Trigger that produced a notify() call — used for logs/metrics only. One ON_THE_WAY
 * can arrive via a check-out (FINISH), a can't-do (CANT_DO) or an early-change
 * correction (EARLY_CHANGE); all three share the same deterministic id.
 */
export type TenantEtaTrigger =
  | 'MORNING'
  | 'FINISH'
  | 'CANT_DO'
  | 'LATE_NOTICE'
  | 'SWEEP'
  | 'EARLY_CHANGE';

export interface TenantEtaNotifyInput {
  kind: TenantEtaKind;
  trigger: TenantEtaTrigger;
  /** Plan stop — the source of appointmentId / tenantId / scheduledDate / serviceStartAt / windowTimezone. */
  planStop: EtaPlanStop;
  /** Projected stop — the source of projectedStartAt / projectedArrivalAt / window / lateS. */
  projected: ProjectedStop;
  /** Rental-tenant confirmation metadata for the confirmation guard (L-F06-02). */
  stopMeta: TenantEtaStopMeta;
  /** The band already computed by the caller via computeEtaBand. */
  band: EtaBand;
  appointmentWithRelations: AppointmentWithRelations;
  tenant: TenantEntity;
  settings: TenantEtaNoticesSetting;
  /** Fresh-read plan version (payload + log, L-F04-15). */
  planVersion: number;
  /** Plan snapshot approximate flag (payload + log, D17). */
  approximate: boolean;
  now: Date;
}

export interface TenantEtaNotifyResult {
  created: number;
  duplicates: number;
  skippedReason?: string;
}

interface TenantEtaMetrics {
  incrementTenantEtaNoticeCount(kind: string, channel: string): void;
}

const MILLIS_PER_MINUTE = 60_000;

/**
 * Creates the EMAIL/SMS rows for one tenant arrival notice, applying every
 * suppression guard in a fixed order and deduplicating atomically through the
 * deterministic notification id. The three trigger use cases (morning, evaluate,
 * sweep) all route their sends through this one service so "exactly once per
 * stop/day/channel" (01.A7) is enforced in a single place.
 */
export class TenantEtaNotifier {
  constructor(
    private readonly createNotification: CreateNotificationUseCase,
    private readonly notificationRepo: INotificationRepository,
    private readonly buildPayload: BuildNotificationPayloadService,
    private readonly appointmentCodeFormatter: AppointmentCodeFormatter,
    private readonly portalBaseUrl: string,
    private readonly metrics: TenantEtaMetrics,
    private readonly logger: Logger,
  ) {}

  async notify(input: TenantEtaNotifyInput): Promise<TenantEtaNotifyResult> {
    const { kind, trigger, planStop, projected, stopMeta, band, tenant, settings, now } = input;
    const appointmentId = planStop.appointmentId;
    const tenantId = planStop.tenantId;
    const timezone = planStop.windowTimezone;

    const skip = (reason: string, channel?: NotificationChannel): TenantEtaNotifyResult => {
      this.logger.info(
        { kind, trigger, appointmentId, reason, ...(channel ? { channel } : {}) },
        'tenant_eta.notice_skipped',
      );
      return { created: 0, duplicates: 0, skippedReason: reason };
    };

    // ── Guard order (data-model §Guard order) ──────────────────────────────
    if (!settings.enabled) return skip('DISABLED');

    const localHour = Number(wallTimeHHmm(now, timezone).slice(0, 2));
    if (localHour < settings.morningHour) return skip('BEFORE_MORNING_HOUR');

    if (!isTenantEtaNoticesEnabled(tenant.settingsJson)) return skip('AGENCY_ETA_OFF');
    if (!isRentalTenantNotificationsEnabled(tenant.settingsJson)) return skip('AGENCY_SWITCH_OFF');

    if (suppressesOccupantNotifications(input.appointmentWithRelations.serviceTypeFlowType)) {
      return skip('FLOW_TYPE_NO_OCCUPANT');
    }

    // Tenant confirmation (L-F06-02)
    if (stopMeta.rentalTenantConfirmationStatus === 'UNAVAILABLE') return skip('TENANT_UNAVAILABLE');
    const unconfirmed =
      (stopMeta.rentalTenantConfirmationStatus === 'PENDING' ||
        stopMeta.rentalTenantConfirmationStatus === 'NO_RESPONSE') &&
      stopMeta.keyRequired &&
      stopMeta.requiresRentalTenantConfirmation;
    if (unconfirmed) return skip('TENANT_UNCONFIRMED');

    // On-the-way lead (L-F06-01) — never applies to DELAY.
    if (kind === 'ON_THE_WAY') {
      const arrival = projected.projectedArrivalAt;
      if (!arrival || arrival.getTime() - now.getTime() > TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES * MILLIS_PER_MINUTE) {
        return skip('NEXT_TOO_FAR');
      }
    }

    // ── Recipients (D1 + channelMode) ──────────────────────────────────────
    const contact = input.appointmentWithRelations.contact;
    const email = contact?.effectiveEmail ?? null;
    const phone = contact?.effectivePhone ?? null;
    let channels = this.resolveChannels(settings.channelMode, email, phone);
    if (channels.length === 0) return skip('NO_RECIPIENT');

    // ── SMS budget reserve (D15) — only read the counter when an SMS leg exists ──
    if (channels.includes('SMS')) {
      const cap =
        typeof tenant.settingsJson['notificationDailyCapSms'] === 'number'
          ? (tenant.settingsJson['notificationDailyCapSms'] as number)
          : 100;
      const limit = Math.floor((cap * settings.smsBudgetSharePercent) / 100);
      const count = await this.notificationRepo.countByTenantChannelSince(
        tenantId,
        'SMS',
        startOfUtcDay(now),
      );
      if (count >= limit) {
        this.logger.info({ tenantId, count, cap, limit }, 'tenant_eta.sms_budget_reserved');
        this.logger.info(
          { kind, trigger, appointmentId, reason: 'SMS_BUDGET_RESERVED', channel: 'SMS' },
          'tenant_eta.notice_skipped',
        );
        channels = channels.filter((c) => c !== 'SMS');
        // SMS_ELSE_EMAIL falls back to email when the SMS leg is reserved away.
        if (settings.channelMode === 'SMS_ELSE_EMAIL' && email) channels = ['EMAIL'];
        if (channels.length === 0) return { created: 0, duplicates: 0, skippedReason: 'SMS_BUDGET_RESERVED' };
      }
    }

    // ── Payload (built once; identical across channels) ─────────────────────
    const etaStrings = formatEtaBand(band, timezone);
    const payloadJson: Record<string, string> = {
      ...this.buildPayload.build({
        templateCode: TENANT_ETA_TEMPLATE_CODES[kind],
        tenant,
        appointment: input.appointmentWithRelations.appointment,
        contact,
        propertyAddress: input.appointmentWithRelations.propertyAddress,
        branchName: input.appointmentWithRelations.branchName,
        inspectorName: input.appointmentWithRelations.inspectorName,
        serviceTypeName: input.appointmentWithRelations.serviceTypeName,
        rawPortalToken: null,
        portalBaseUrl: this.portalBaseUrl,
        appointmentCodeFormatter: this.appointmentCodeFormatter,
        eta: etaStrings,
      }),
      // Non-template metadata (L-F06-05 / L-F04-15); survives the post-send scrub.
      etaBandFromAt: band.from.toISOString(),
      planVersion: String(input.planVersion),
      approximate: String(input.approximate),
    };
    if (planStop.serviceStartAt) payloadJson['serviceStartAt'] = planStop.serviceStartAt.toISOString();

    // ── Create one row per surviving channel ────────────────────────────────
    let created = 0;
    let duplicates = 0;
    for (const channel of channels) {
      const recipient = channel === 'SMS' ? (phone ? toE164Au(phone) ?? phone : '') : (email ?? '');
      const out = await this.createNotification.execute({
        notificationId: getTenantEtaNotificationId({
          kind,
          appointmentId,
          scheduledDate: planStop.scheduledDate,
          channel,
        }),
        tenantId,
        appointmentId,
        recipient,
        channel,
        templateCode: TENANT_ETA_TEMPLATE_CODES[kind],
        payloadJson,
      });
      if (out.created) {
        created += 1;
        this.metrics.incrementTenantEtaNoticeCount(kind, channel);
        this.logger.info(
          {
            kind,
            trigger,
            appointmentId,
            tenantId,
            channel,
            bandFrom: etaStrings.from,
            bandTo: etaStrings.to,
            projectedStartAt: projected.projectedStartAt?.toISOString() ?? null,
            lateMinutes: Math.round(projected.lateS / 60),
            approximate: input.approximate,
            planVersion: input.planVersion,
          },
          'tenant_eta.notice_created',
        );
      } else {
        duplicates += 1;
        this.logger.info(
          { kind, trigger, appointmentId, reason: 'ALREADY_SENT', channel },
          'tenant_eta.notice_skipped',
        );
      }
    }

    return { created, duplicates };
  }

  /**
   * Count of this appointment's rows for `kind` created since the stop's
   * agency-local midnight — the "one per day" check. `count` deliberately does
   * NOT exclude skipped rows, so a SKIPPED_OPT_OUT/FAILED row from today still
   * counts toward the daily limit.
   */
  async alreadyNotified(kind: TenantEtaKind, planStop: EtaPlanStop): Promise<boolean> {
    const fromDate = zonedWallTimeToUtc(planStop.scheduledDate, '00:00', planStop.windowTimezone);
    const count = await this.notificationRepo.count({
      tenantId: planStop.tenantId,
      appointmentId: planStop.appointmentId,
      templateCode: TENANT_ETA_TEMPLATE_CODES[kind],
      fromDate: fromDate.toISOString(),
    });
    return count > 0;
  }

  private resolveChannels(
    channelMode: TenantEtaNoticesSetting['channelMode'],
    email: string | null,
    phone: string | null,
  ): NotificationChannel[] {
    if (channelMode === 'SMS_ELSE_EMAIL') {
      if (phone) return ['SMS'];
      if (email) return ['EMAIL'];
      return [];
    }
    // BOTH
    const channels: NotificationChannel[] = [];
    if (email) channels.push('EMAIL');
    if (phone) channels.push('SMS');
    return channels;
  }
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
