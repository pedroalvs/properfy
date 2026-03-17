import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { CreateNotificationUseCase } from './create-notification.use-case';

export interface DispatchRemindersOutput {
  dispatched: number;
  skipped: number;
}

const REMINDER_WINDOWS: Array<[number, string]> = [
  [7, 'REMINDER_7_DAYS'],
  [5, 'REMINDER_5_DAYS'],
  [3, 'REMINDER_3_DAYS'],
];

export class DispatchRemindersUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly notificationRepo: INotificationRepository,
    private readonly createNotification: CreateNotificationUseCase,
  ) {}

  async execute(today?: Date): Promise<DispatchRemindersOutput> {
    const now = today ?? new Date();
    let dispatched = 0;
    let skipped = 0;

    for (const [offsetDays, templateCode] of REMINDER_WINDOWS) {
      const targetDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
      );
      const appointments = await this.appointmentRepo.findScheduledOnDate(targetDate);

      for (const { appointment, contact } of appointments) {
        if (!contact?.primaryEmail) {
          skipped++;
          continue;
        }

        const alreadySent = await this.notificationRepo.existsByAppointmentAndTemplate(
          appointment.id,
          templateCode,
        );
        if (alreadySent) {
          skipped++;
          continue;
        }

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
            appointmentReference: appointment.id,
          },
        });
        dispatched++;
      }
    }

    return { dispatched, skipped };
  }
}
