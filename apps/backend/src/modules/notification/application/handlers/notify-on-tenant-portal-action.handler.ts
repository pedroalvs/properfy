import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import type { CreateNotificationUseCase } from '../use-cases/create-notification.use-case';

export class NotifyOnTenantPortalActionHandler {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly propertyRepo: IPropertyRepository,
    private readonly createNotification: CreateNotificationUseCase,
  ) {}

  async execute(input: {
    appointmentId: string;
    action: string;
  }): Promise<void> {
    const templateCode =
      input.action === 'CONFIRM'
        ? 'INSPECTION_CONFIRMED'
        : input.action === 'RESCHEDULE'
          ? 'INSPECTION_RESCHEDULED'
          : null;
    if (!templateCode) return;

    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result?.contact?.primaryEmail) return;

    const { appointment, contact } = result;
    const property = await this.propertyRepo.findById(appointment.propertyId, appointment.tenantId);

    await this.createNotification.execute({
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      recipient: contact.primaryEmail,
      channel: 'EMAIL',
      templateCode,
      payloadJson: {
        tenantName: contact.tenantName,
        scheduledDate: appointment.scheduledDate.toISOString().split('T')[0],
        timeSlot: appointment.timeSlot,
        propertyAddress: property?.fullAddress ?? '',
        appointmentReference: appointment.id,
      },
    });
  }
}
