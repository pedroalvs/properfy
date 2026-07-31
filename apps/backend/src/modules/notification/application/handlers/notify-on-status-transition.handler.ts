import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { MintPortalTokenService } from '../../../rental-tenant-portal/domain/mint-portal-token.service';
import type { BuildNotificationPayloadService } from '../../domain/build-notification-payload.service';
import type { AppointmentCodeFormatter } from '../../../appointment/domain/appointment-code.formatter';
import type { CreateNotificationUseCase } from '../use-cases/create-notification.use-case';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';
import type { NotificationChannel } from '@properfy/shared';
import type { AppointmentEntity } from '../../../appointment/domain/appointment.entity';
import type { TenantEntity } from '../../../tenant/domain/tenant.entity';
import type { AppointmentContactEntity } from '../../../appointment/domain/appointment-contact.entity';
import type { NotificationEntity } from '../../domain/notification.entity';
import {
  formatScheduledDate,
  formatTimeSlot,
  legacyIsoScheduledDate,
  legacyIsoTimeSlot,
} from '../../domain/build-notification-payload.service';

/**
 * Everything this handler can announce to the rental tenant. The dedupe looks at
 * the whole set, not at one code, so a cancellation followed by a new scheduling
 * is recognised as a state change and notifies again.
 *
 * INSPECTION_CANCELLED_AGENCY is deliberately absent: this set feeds
 * `findLatestByAppointmentAndTemplates`, which returns a single latest row across
 * the whole set, and `templateFamily()` folds the _SMS codes onto their email
 * code. Adding the agency code would make the agency and tenant sends suppress
 * each other. The agency notice has its own recipient and its own lifecycle.
 */
const STATUS_TRANSITION_TEMPLATE_CODES = [
  'INSPECTION_NOTICE',
  'INSPECTION_NOTICE_SMS',
  'INSPECTION_CANCELLED',
  'INSPECTION_CANCELLED_SMS',
] as const;

/** Agency-facing cancellation notice, sent to the branch contact. */
const AGENCY_CANCELLED_TEMPLATE_CODE = 'INSPECTION_CANCELLED_AGENCY';
const AGENCY_REJECTED_TEMPLATE_CODE = 'INSPECTION_REJECTED_AGENCY';

/** Email and SMS variants of one announcement are the same event to the tenant. */
function templateFamily(templateCode: string): string {
  return templateCode.replace(/_SMS$/, '');
}

/**
 * True when a stored payload value still describes the current appointment.
 *
 * Accepts the current display shape OR the pre-rollout ISO shape: payloads
 * written before the dd/mm/yyyy + 12h change hold `2026-04-01` / `09:00-12:00`,
 * and treating those as "changed" would re-announce every historical
 * appointment once.
 *
 * There is no notification purge job, so there is no date after which the legacy
 * arm is provably unreachable: it stops mattering only once every appointment
 * whose latest announcement predates the rollout has been superseded. Keeping it
 * indefinitely is harmless — the two shapes are lexically disjoint, so the extra
 * arm can never match a value the current formatter would not also have matched.
 */
function storedValueMatches(stored: string, current: string, legacy: string): boolean {
  return stored === current || stored === legacy;
}

/**
 * True when `latest` already told the tenant what we are about to send — same
 * announcement, same date and slot. Keys absent from the stored payload are not
 * compared: INSPECTION_CANCELLED declares no timeSlot, so requiring it would
 * make every cancellation re-send.
 */
function alreadyAnnounced(
  latest: NotificationEntity,
  emailCode: string,
  appointment: AppointmentEntity,
): boolean {
  if (templateFamily(latest.templateCode) !== emailCode) return false;

  const payload = latest.payloadJson;
  if (
    payload.scheduledDate !== undefined &&
    !storedValueMatches(
      payload.scheduledDate,
      formatScheduledDate(appointment.scheduledDate),
      legacyIsoScheduledDate(appointment.scheduledDate),
    )
  ) {
    return false;
  }
  if (
    payload.timeSlot !== undefined &&
    !storedValueMatches(
      payload.timeSlot,
      formatTimeSlot(appointment.timeSlotStart, appointment.timeSlotEnd),
      legacyIsoTimeSlot(appointment.timeSlotStart, appointment.timeSlotEnd),
    )
  ) {
    return false;
  }
  return true;
}

export class NotifyOnStatusTransitionHandler {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly propertyRepo: IPropertyRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly notificationRepo: INotificationRepository,
    private readonly mintPortalTokenService: MintPortalTokenService,
    private readonly buildNotificationPayload: BuildNotificationPayloadService,
    private readonly appointmentCodeFormatter: AppointmentCodeFormatter,
    private readonly createNotification: CreateNotificationUseCase,
    private readonly rentalTenantPortalBaseUrl: string,
    private readonly logger?: Logger,
    private readonly metrics?: MetricsCollector,
  ) {}

  async execute(input: {
    appointmentId: string;
    /** H6: Tenant scope for repository calls. When present, enforces cross-tenant isolation. */
    tenantId?: string | null;
    previousStatus: string;
    targetStatus: string;
    /**
     * Consulted ONLY for a CANCELLED target. The agency is always told; the rental
     * tenant is told only on an explicit opt-in AND only when they had confirmed.
     * Absent means "do not notify the tenant", which is what makes the system
     * sweeps (overdue cancellation) agency-only without passing anything.
     */
    notifyRentalTenant?: boolean;
  }): Promise<void> {
    try {
      await this.executeInternal(input);
    } catch (error) {
      this.logger?.error(
        {
          err: error,
          handler: 'NotifyOnStatusTransitionHandler',
          appointmentId: input.appointmentId,
          previousStatus: input.previousStatus,
          targetStatus: input.targetStatus,
        },
        'Notification handler failed',
      );
      this.metrics?.incrementNotificationHandlerErrorCount();
      throw error;
    }
  }

  private async executeInternal(input: {
    appointmentId: string;
    tenantId?: string | null;
    previousStatus: string;
    targetStatus: string;
    notifyRentalTenant?: boolean;
  }): Promise<void> {
    const isCancellation = input.targetStatus === 'CANCELLED';
    // A rejection is announced to the agency only, so it has no rental-tenant
    // template of its own and cannot be expressed as an `emailCode`.
    const isRejection = input.targetStatus === 'REJECTED';
    const emailCode =
      input.targetStatus === 'SCHEDULED'
        ? 'INSPECTION_NOTICE'
        : isCancellation
          ? 'INSPECTION_CANCELLED'
          : null;
    if (!emailCode && !isRejection) return;

    // H6: Scope repository call by tenantId when available
    const result = await this.appointmentRepo.findById(
      input.appointmentId,
      input.tenantId ?? null,
    );
    if (!result) return;

    const { appointment, contact } = result;

    // Dedupe by occurrence, not by lifetime: skip only a replay of the same
    // announcement. Must run before the token mint below — minting revokes the
    // link the tenant already holds, so it can never happen on a skipped send.
    //
    // Evaluated up-front for a non-cancellation so a deduped replay costs exactly
    // one query: `notify-on-group-accepted` re-invokes this handler for every
    // member of a group, so anything loaded before this point multiplies across
    // the group. A cancellation defers the check, because the agency leg below
    // must run whether or not the TENANT's announcement is a replay.
    if (emailCode && !isCancellation) {
      if (!contact) return;
      if (await this.isReplay(appointment, emailCode)) return;
    }

    const tenant = await this.tenantRepo.findById(appointment.tenantId);
    if (!tenant) return;

    const property = await this.propertyRepo.findById(appointment.propertyId, appointment.tenantId);

    // A rejection stops here: the agency is told so it can reschedule, and there
    // is no rental-tenant leg. Deliberately before the contact guard, for the
    // same reason as the cancellation notice — imported appointments with no
    // contact are exactly the ones that get rejected. No portal token is minted
    // either: minting revokes the link the tenant is still holding, and after a
    // portal decline they need it to change time.
    if (isRejection) {
      await this.announceToAgency({
        templateCode: AGENCY_REJECTED_TEMPLATE_CODE,
        appointment,
        contact,
        tenant,
        propertyAddress: property?.fullAddress ?? '',
        serviceTypeName: result.serviceTypeName ?? null,
      });
      return;
    }

    // Unreachable — the guard at the top returns when both are falsy — but it
    // narrows `emailCode` for everything below.
    if (!emailCode) return;

    if (isCancellation) {
      // Deliberately BEFORE the contact guard. Import creates appointments with
      // no contact at all (CONTACT_INCOMPLETE is a warning, not an error — see
      // appointment-import-commit.worker.ts), and those are exactly the ones
      // nobody accepts and the overdue sweep cancels. Skipping the agency there
      // would lose the notice in this feature's core scenario. The agency
      // template only needs the address, date and code; the contact contributes
      // the optional rentalTenantName.
      await this.announceToAgency({
        templateCode: AGENCY_CANCELLED_TEMPLATE_CODE,
        appointment,
        contact,
        tenant,
        propertyAddress: property?.fullAddress ?? '',
        serviceTypeName: result.serviceTypeName ?? null,
      });

      // The checkbox is only offered for a confirmed tenant, but the rule lives
      // here: the endpoint can be called directly.
      const tenantOptedIn =
        input.notifyRentalTenant === true &&
        appointment.rentalTenantConfirmationStatus === 'CONFIRMED';
      if (!tenantOptedIn) {
        if (input.notifyRentalTenant === true) {
          // An explicit request we refuse must leave a trace; otherwise a direct
          // API caller gets a 200 and debugs a notification that never existed.
          this.logger?.info(
            {
              appointmentId: appointment.id,
              rentalTenantConfirmationStatus: appointment.rentalTenantConfirmationStatus,
            },
            'Rental-tenant opt-in discarded: the tenant has not confirmed this appointment',
          );
        }
        return;
      }

      if (await this.isReplay(appointment, emailCode)) return;
    }

    // Everything below addresses the rental tenant, so it needs a recipient.
    if (!contact) return;

    // Mint a portal token for SCHEDULED so confirmationLink/rescheduleLink are populated.
    // Failure must not block the notification — links will render empty.
    let rawPortalToken: string | null = null;
    if (input.targetStatus === 'SCHEDULED') {
      try {
        const minted = await this.mintPortalTokenService.mint(appointment, tenant);
        rawPortalToken = minted.rawToken;
      } catch (err) {
        this.logger?.warn(
          { err, appointmentId: appointment.id },
          'Portal token mint failed; confirmationLink omitted',
        );
      }
    }

    const payloadCtx = {
      templateCode: emailCode,
      tenant,
      appointment,
      contact,
      propertyAddress: property?.fullAddress ?? '',
      inspectorName: result.inspectorName ?? null,
      serviceTypeName: result.serviceTypeName ?? null,
      rawPortalToken,
      portalBaseUrl: this.rentalTenantPortalBaseUrl,
      appointmentCodeFormatter: this.appointmentCodeFormatter,
    };

    const recipientEmail = contact.effectiveEmail;
    const recipientPhone = contact.effectivePhone;

    // Independent legs: a tenant with both an email and a phone gets both.
    // The dedupe above is a single decision for the whole announcement — its
    // template set covers the _SMS codes and templateFamily() folds them onto
    // the email code — so it governs both legs without being re-evaluated here.
    //
    // Email first: it carries the same freshly minted portal token, and minting
    // happens once above precisely because a second mint would revoke the link
    // the first message already went out with.
    if (recipientEmail) {
      await this.createNotification.execute({
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        recipient: recipientEmail,
        channel: 'EMAIL',
        templateCode: emailCode,
        payloadJson: this.buildNotificationPayload.build(payloadCtx),
      });
    }

    if (recipientPhone) {
      const smsCode = `${emailCode}_SMS` as string;
      await this.createNotification.execute({
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        recipient: recipientPhone,
        channel: 'SMS' as NotificationChannel,
        templateCode: smsCode,
        payloadJson: this.buildNotificationPayload.build({ ...payloadCtx, templateCode: smsCode }),
      });
    }
    // No email and no phone: skip silently
  }

  /** True when the tenant has already been told exactly this, for this occurrence. */
  private async isReplay(appointment: AppointmentEntity, emailCode: string): Promise<boolean> {
    const lastAnnouncement = await this.notificationRepo.findLatestByAppointmentAndTemplates(
      appointment.id,
      appointment.tenantId,
      STATUS_TRANSITION_TEMPLATE_CODES,
    );
    return !!lastAnnouncement && alreadyAnnounced(lastAnnouncement, emailCode, appointment);
  }

  /**
   * Email the agency that the inspection is off. Unconditional for a cancellation
   * — including system sweeps — because the agency ordered the work and is the one
   * party that always needs to know it will not happen.
   *
   * Recipient is `branch.contactEmail`, matching PROPERTY_MANAGER_ESCALATION: the
   * agency (tenant) record carries no email address of its own.
   *
   * Failures are contained here on purpose. Both legs share one `execute()` call
   * and the transition use case swallows whatever this handler throws, so letting
   * an agency failure propagate would silently drop the rental tenant's email too.
   */
  private async announceToAgency(ctx: {
    templateCode: string;
    appointment: AppointmentEntity;
    contact: AppointmentContactEntity | null;
    tenant: TenantEntity;
    propertyAddress: string;
    serviceTypeName: string | null;
  }): Promise<void> {
    try {
      const branch = await this.branchRepo.findById(
        ctx.appointment.branchId,
        ctx.appointment.tenantId,
      );
      if (!branch?.contactEmail) {
        // Counted, not just logged: `branches.contact_email` is nullable and
        // optional at creation, so this is a steady-state population rather than
        // an edge case, and it defeats "the agency is always told" silently.
        this.logger?.warn(
          {
            appointmentId: ctx.appointment.id,
            branchId: ctx.appointment.branchId,
            templateCode: ctx.templateCode,
          },
          'Branch has no contact email; agency notice skipped',
        );
        this.metrics?.incrementNotificationHandlerErrorCount();
        return;
      }

      await this.createNotification.execute({
        tenantId: ctx.appointment.tenantId,
        appointmentId: ctx.appointment.id,
        recipient: branch.contactEmail,
        channel: 'EMAIL',
        templateCode: ctx.templateCode,
        payloadJson: this.buildNotificationPayload.build({
          templateCode: ctx.templateCode,
          tenant: ctx.tenant,
          appointment: ctx.appointment,
          contact: ctx.contact,
          branchName: branch.name,
          propertyAddress: ctx.propertyAddress,
          serviceTypeName: ctx.serviceTypeName,
          rawPortalToken: null,
          portalBaseUrl: this.rentalTenantPortalBaseUrl,
          appointmentCodeFormatter: this.appointmentCodeFormatter,
        }),
      });
    } catch (err) {
      this.logger?.error(
        { err, appointmentId: ctx.appointment.id, templateCode: ctx.templateCode },
        'Agency notice failed; rental-tenant legs continue',
      );
      // Still counted: swallowing the throw keeps the tenant legs alive, but the
      // failure must not become invisible to the notification error metric.
      this.metrics?.incrementNotificationHandlerErrorCount();
    }
  }
}
