import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { MintPortalTokenService } from '../../../rental-tenant-portal/domain/mint-portal-token.service';
import type { BuildNotificationPayloadService } from '../../domain/build-notification-payload.service';
import type { AppointmentCodeFormatter } from '../../../appointment/domain/appointment-code.formatter';
import type { CreateNotificationUseCase } from '../use-cases/create-notification.use-case';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';
import type { NotificationChannel } from '@properfy/shared';

export class NotifyOnStatusTransitionHandler {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly propertyRepo: IPropertyRepository,
    private readonly tenantRepo: ITenantRepository,
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
  }): Promise<void> {
    const emailCode =
      input.targetStatus === 'SCHEDULED'
        ? 'INSPECTION_NOTICE'
        : input.targetStatus === 'CANCELLED'
          ? 'INSPECTION_CANCELLED'
          : null;
    if (!emailCode) return;

    // H5: Check idempotency before expensive repo loads and token mint.
    // For the primary (email) path this saves appointment + tenant + property reads.
    const emailAlreadySent = await this.notificationRepo.existsByAppointmentAndTemplate(
      input.appointmentId,
      emailCode,
    );
    if (emailAlreadySent) return;

    // H6: Scope repository call by tenantId when available
    const result = await this.appointmentRepo.findById(
      input.appointmentId,
      input.tenantId ?? null,
    );
    if (!result?.contact) return;

    const { appointment, contact } = result;

    const tenant = await this.tenantRepo.findById(appointment.tenantId);
    if (!tenant) return;

    const property = await this.propertyRepo.findById(appointment.propertyId, appointment.tenantId);

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

    if (recipientEmail) {
      // Idempotency already confirmed above — send directly
      await this.createNotification.execute({
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        recipient: recipientEmail,
        channel: 'EMAIL',
        templateCode: emailCode,
        payloadJson: this.buildNotificationPayload.build(payloadCtx),
      });
    } else {
      // SMS fallback: use ${CODE}_SMS template when no email is available
      const smsCode = `${emailCode}_SMS` as string;
      if (recipientPhone) {
        const smsAlreadySent = await this.notificationRepo.existsByAppointmentAndTemplate(
          appointment.id,
          smsCode,
        );
        if (!smsAlreadySent) {
          await this.createNotification.execute({
            tenantId: appointment.tenantId,
            appointmentId: appointment.id,
            recipient: recipientPhone,
            channel: 'SMS' as NotificationChannel,
            templateCode: smsCode,
            payloadJson: this.buildNotificationPayload.build({ ...payloadCtx, templateCode: smsCode }),
          });
        }
      }
      // No email and no phone: skip silently
    }
  }
}
