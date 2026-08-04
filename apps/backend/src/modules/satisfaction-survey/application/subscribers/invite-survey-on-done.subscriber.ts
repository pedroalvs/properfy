import type { DomainEvent, DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { APPOINTMENT_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AppointmentCodeFormatter } from '../../../appointment/domain/appointment-code.formatter';
import type { IRentalTenantPortalTokenRepository } from '../../../rental-tenant-portal/domain/rental-tenant-portal-token.repository';
import type { ITokenEncrypter } from '../../../rental-tenant-portal/domain/token-encrypter';
import type { INotificationRepository } from '../../../notification/domain/notification.repository';
import type { BuildNotificationPayloadService } from '../../../notification/domain/build-notification-payload.service';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { ISatisfactionSurveyRepository } from '../../domain/satisfaction-survey.repository';

const SURVEY_TEMPLATE_CODE = 'INSPECTION_SATISFACTION_SURVEY';

/** How long after completion the tenant can still rate the inspection. */
const SURVEY_WINDOW_DAYS = 14;

interface Logger {
  warn(obj: unknown, msg?: string): void;
}

/**
 * Invites the rental tenant to rate an inspection once it is marked `DONE`.
 *
 * A subscriber rather than another branch inside `ExecuteStatusTransitionUseCase`:
 * that use case's after-commit block is already a long, order-sensitive sequence
 * of appointment and billing concerns, and the bus gives exactly the semantics
 * this needs — emission happens after the commit (so a fresh read sees `DONE`)
 * and `Promise.allSettled` means a failure here can never break the transition.
 *
 * The token is **extended, never re-minted**: minting revokes the live link the
 * tenant already holds, which would break the very message being sent.
 *
 * Known limitation: the bus is in-process, so a path reaching `DONE` outside
 * `ExecuteStatusTransitionUseCase` would not fire this. No such path exists
 * today — the inspector's finish-inspection flow goes through that use case.
 */
export class InviteSurveyOnDoneSubscriber {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly tokenRepo: IRentalTenantPortalTokenRepository,
    private readonly surveyRepo: ISatisfactionSurveyRepository,
    private readonly notificationRepo: INotificationRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly tokenEncrypter: ITokenEncrypter,
    private readonly buildNotificationPayload: BuildNotificationPayloadService,
    private readonly appointmentCodeFormatter: AppointmentCodeFormatter,
    private readonly createNotification: CreateNotificationUseCase,
    private readonly portalBaseUrl: string,
    private readonly logger?: Logger,
  ) {}

  register(eventBus: DomainEventBus): void {
    eventBus.subscribe(APPOINTMENT_EVENTS.STATUS_TRANSITION, (event) => this.handle(event));
  }

  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload as { appointmentId: string; tenantId: string; toStatus: string };
    if (payload.toStatus !== 'DONE') return;

    try {
      await this.invite(payload, event.occurredAt);
    } catch (err) {
      // Never let this reach the transition. The bus already isolates us, but a
      // throw here would also skip the remaining subscribers on some buses.
      this.logger?.warn(
        { err, appointmentId: payload.appointmentId },
        'Failed to invite the rental tenant to the satisfaction survey',
      );
    }
  }

  private async invite(
    payload: { appointmentId: string; tenantId: string },
    occurredAt: Date,
  ): Promise<void> {
    // The event carries neither the inspector nor the contact, so re-read.
    const result = await this.appointmentRepo.findById(payload.appointmentId, payload.tenantId);
    if (!result) return;

    const { appointment, contact } = result;

    // Nobody to rate: the survey row requires an inspector, and a rating with no
    // one to attribute it to would be meaningless.
    if (!appointment.inspectorId) return;

    // No portal token ever existed for this appointment (e.g. no rental-tenant
    // contact at creation), so there is no link to extend or send.
    const token = await this.tokenRepo.findLatestExtendableByAppointmentId(payload.appointmentId);
    if (!token) return;

    const notBefore = new Date(occurredAt.getTime() + SURVEY_WINDOW_DAYS * 86_400_000);
    const extended = await this.tokenRepo.extendExpiryAndReactivate(
      token.id,
      payload.appointmentId,
      notBefore,
    );
    // Raced by the expiry worker, or revoked in between. Sending a link that no
    // longer opens is worse than sending nothing.
    if (!extended) return;

    // Everything below sends a message, so it needs somewhere to send it.
    if (!contact?.effectiveEmail) return;

    // Already answered — asking again would be noise.
    if (await this.surveyRepo.findByAppointmentId(payload.appointmentId)) return;

    // Lifetime dedupe: one request per inspection, so a DONE → DRAFT → DONE loop
    // does not re-ask. Same primitive the portal-action handler uses.
    if (
      await this.notificationRepo.existsByAppointmentAndTemplate(
        payload.appointmentId,
        SURVEY_TEMPLATE_CODE,
        payload.tenantId,
      )
    ) {
      return;
    }

    // Recover the raw token rather than minting a fresh one, exactly as the
    // operator's "copy portal link" action does.
    if (!token.rawTokenEncrypted) {
      this.logger?.warn(
        { appointmentId: payload.appointmentId },
        'Survey invite skipped: portal token is not recoverable',
      );
      return;
    }

    let rawToken: string;
    try {
      rawToken = this.tokenEncrypter.decrypt(token.rawTokenEncrypted);
    } catch (err) {
      this.logger?.warn(
        { err, appointmentId: payload.appointmentId },
        'Survey invite skipped: portal token could not be decrypted',
      );
      return;
    }

    const tenant = await this.tenantRepo.findById(appointment.tenantId);
    if (!tenant) return;

    // Routing through CreateNotificationUseCase is what applies the RENTAL_TENANT
    // target gate and the agency kill switch — this template must never bypass
    // an agency that has occupant notifications turned off.
    await this.createNotification.execute({
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      recipient: contact.effectiveEmail,
      channel: 'EMAIL',
      templateCode: SURVEY_TEMPLATE_CODE,
      payloadJson: this.buildNotificationPayload.build({
        templateCode: SURVEY_TEMPLATE_CODE,
        tenant,
        appointment,
        contact,
        propertyAddress: result.propertyAddress ?? '',
        inspectorName: result.inspectorName ?? null,
        serviceTypeName: result.serviceTypeName ?? null,
        rawPortalToken: rawToken,
        portalBaseUrl: this.portalBaseUrl,
        appointmentCodeFormatter: this.appointmentCodeFormatter,
      }),
    });
  }
}
