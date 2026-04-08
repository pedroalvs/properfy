import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import type { CreateNotificationUseCase } from '../use-cases/create-notification.use-case';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';

export class NotifyOnStatusTransitionHandler {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly propertyRepo: IPropertyRepository,
    private readonly createNotification: CreateNotificationUseCase,
    private readonly logger?: Logger,
    private readonly metrics?: MetricsCollector,
  ) {}

  async execute(input: {
    appointmentId: string;
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
    previousStatus: string;
    targetStatus: string;
  }): Promise<void> {
    const templateCode =
      input.targetStatus === 'SCHEDULED'
        ? 'INSPECTION_NOTICE'
        : input.targetStatus === 'CANCELLED'
          ? 'INSPECTION_CANCELLED'
          : null;
    if (!templateCode) return;

    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result?.contact?.primaryEmail) return;

    const { appointment, contact } = result;
    if (!contact?.primaryEmail) return;

    const property = await this.propertyRepo.findById(appointment.propertyId, appointment.tenantId);
    const scheduledDateStr = appointment.scheduledDate.toISOString().split('T')[0] ?? '';

    await this.createNotification.execute({
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      recipient: contact.primaryEmail,
      channel: 'EMAIL',
      templateCode,
      payloadJson: {
        tenantName: contact.tenantName,
        scheduledDate: scheduledDateStr,
        timeSlot: appointment.timeSlot,
        propertyAddress: property?.fullAddress ?? '',
        appointmentReference: appointment.id,
      },
    });
  }
}
