import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { MintPortalTokenService } from '../../../rental-tenant-portal/domain/mint-portal-token.service';
import type { BuildNotificationPayloadService } from '../../domain/build-notification-payload.service';
import type { AppointmentCodeFormatter } from '../../../appointment/domain/appointment-code.formatter';
import type { CreateNotificationUseCase } from '../use-cases/create-notification.use-case';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';
import type { NotificationChannel } from '@properfy/shared';

/**
 * Notifies the rental tenant when an operator edits date/time of a SCHEDULED
 * appointment (which keeps its status, so no →SCHEDULED transition fires
 * INSPECTION_NOTICE). Mints a fresh portal token — the previous ones were
 * revoked by the caller because they pointed at the old date.
 *
 * Deliberately NOT deduplicated by template: a second reschedule of the same
 * appointment must notify again (existsByAppointmentAndTemplate would skip it).
 */
export class NotifyOnAdminRescheduleHandler {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly propertyRepo: IPropertyRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly mintPortalTokenService: MintPortalTokenService,
    private readonly buildNotificationPayload: BuildNotificationPayloadService,
    private readonly appointmentCodeFormatter: AppointmentCodeFormatter,
    private readonly createNotification: CreateNotificationUseCase,
    private readonly rentalTenantPortalBaseUrl: string,
    private readonly logger?: Logger,
    private readonly metrics?: MetricsCollector,
  ) {}

  async execute(input: { appointmentId: string; tenantId?: string | null }): Promise<void> {
    try {
      await this.executeInternal(input);
    } catch (error) {
      this.logger?.error(
        {
          err: error,
          handler: 'NotifyOnAdminRescheduleHandler',
          appointmentId: input.appointmentId,
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
  }): Promise<void> {
    const emailCode = 'INSPECTION_RESCHEDULED';

    const result = await this.appointmentRepo.findById(
      input.appointmentId,
      input.tenantId ?? null,
    );
    if (!result?.contact) return;

    const { appointment, contact } = result;

    const tenant = await this.tenantRepo.findById(appointment.tenantId);
    if (!tenant) return;

    const property = await this.propertyRepo.findById(appointment.propertyId, appointment.tenantId);

    // Mint a portal token so confirmationLink/rescheduleLink reflect the new date.
    // Failure must not block the notification — links will render empty.
    let rawPortalToken: string | null = null;
    try {
      const minted = await this.mintPortalTokenService.mint(appointment, tenant);
      rawPortalToken = minted.rawToken;
    } catch (err) {
      this.logger?.warn(
        { err, appointmentId: appointment.id },
        'Portal token mint failed; confirmationLink omitted',
      );
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

    if (recipientEmail) {
      await this.createNotification.execute({
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        recipient: recipientEmail,
        channel: 'EMAIL',
        templateCode: emailCode,
        payloadJson: this.buildNotificationPayload.build(payloadCtx),
      });
    } else if (recipientPhone) {
      const smsCode = `${emailCode}_SMS`;
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
}
