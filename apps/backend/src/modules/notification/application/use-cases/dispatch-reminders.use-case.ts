import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { CreateNotificationUseCase } from './create-notification.use-case';
import type { NotificationChannel } from '@properfy/shared';

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
        // Determine channel and recipient
        let channel: NotificationChannel;
        let recipient: string;
        let effectiveTemplateCode: string;

        if (contact?.primaryEmail) {
          channel = 'EMAIL';
          recipient = contact.primaryEmail;
          effectiveTemplateCode = templateCode;
        } else if (contact?.primaryPhone) {
          // GAP-010: SMS fallback when email is missing but phone is present
          channel = 'SMS';
          recipient = contact.primaryPhone;
          effectiveTemplateCode = `${templateCode}_SMS`;
        } else {
          // No email and no phone: skip entirely
          skipped++;
          continue;
        }

        const alreadySent = await this.notificationRepo.existsByAppointmentAndTemplate(
          appointment.id,
          effectiveTemplateCode,
        );
        if (alreadySent) {
          skipped++;
          continue;
        }

        await this.createNotification.execute({
          tenantId: appointment.tenantId,
          appointmentId: appointment.id,
          recipient,
          channel,
          templateCode: effectiveTemplateCode,
          payloadJson: {
            tenantName: contact.tenantName,
            scheduledDate: appointment.scheduledDate.toISOString().split('T')[0] ?? '',
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
