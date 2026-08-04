import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { BuildNotificationPayloadService } from '../../domain/build-notification-payload.service';
import type { AppointmentCodeFormatter } from '../../../appointment/domain/appointment-code.formatter';
import type { CreateNotificationUseCase } from '../use-cases/create-notification.use-case';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';

export class NotifyOnRentalTenantPortalActionHandler {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly propertyRepo: IPropertyRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly notificationRepo: INotificationRepository,
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
    action: string;
  }): Promise<void> {
    try {
      await this.executeInternal(input);
    } catch (error) {
      this.logger?.error(
        {
          err: error,
          handler: 'NotifyOnRentalTenantPortalActionHandler',
          appointmentId: input.appointmentId,
          action: input.action,
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
    action: string;
  }): Promise<void> {
    const emailCode =
      input.action === 'CONFIRM'
        ? 'INSPECTION_CONFIRMED'
        : input.action === 'RESCHEDULE'
          ? 'INSPECTION_RESCHEDULED'
          : input.action === 'UNAVAILABLE'
            ? 'INSPECTION_UNAVAILABILITY_REPORTED'
            : null;
    if (!emailCode) return;

    // Scope repository call by tenantId when available.
    const result = await this.appointmentRepo.findById(
      input.appointmentId,
      input.tenantId ?? null,
    );
    if (!result?.contact) return;

    const { appointment, contact } = result;

    // One channel, one lookup. This briefly grew a per-leg dedupe while an SMS twin
    // existed; the twin was retired because it only restated the email for an action
    // the occupant had just taken themselves in the portal. Deliberately keyed on the
    // email code alone — consulting a leftover row for the retired SMS code would
    // suppress the email for every occupant who received the old one. The appointment
    // read above supplies the concrete tenant scope.
    const alreadySent = await this.notificationRepo.existsByAppointmentAndTemplate(
      input.appointmentId,
      emailCode,
      appointment.tenantId,
    );
    if (alreadySent) return;

    const tenant = await this.tenantRepo.findById(appointment.tenantId);
    if (!tenant) return;

    const property = await this.propertyRepo.findById(appointment.propertyId, appointment.tenantId);

    const payloadCtx = {
      templateCode: emailCode,
      tenant,
      appointment,
      contact,
      propertyAddress: property?.fullAddress ?? '',
      inspectorName: result.inspectorName ?? null,
      serviceTypeName: result.serviceTypeName ?? null,
      rawPortalToken: null,
      portalBaseUrl: this.rentalTenantPortalBaseUrl,
      appointmentCodeFormatter: this.appointmentCodeFormatter,
    };

    const recipientEmail = contact.effectiveEmail;
    // No email: skip silently. A phone alone is not a fallback here — the SMS twin
    // for these actions was retired, and the portal already confirms the action
    // on screen at the moment the occupant takes it.
    if (!recipientEmail) return;

    await this.createNotification.execute({
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      recipient: recipientEmail,
      channel: 'EMAIL',
      templateCode: emailCode,
      payloadJson: this.buildNotificationPayload.build(payloadCtx),
    });
  }
}
