import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { BuildNotificationPayloadService } from '../../domain/build-notification-payload.service';
import type { AppointmentCodeFormatter } from '../../../appointment/domain/appointment-code.formatter';
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
    private readonly tenantRepo: ITenantRepository,
    private readonly notificationRepo: INotificationRepository,
    private readonly buildNotificationPayload: BuildNotificationPayloadService,
    private readonly appointmentCodeFormatter: AppointmentCodeFormatter,
    private readonly createNotification: CreateNotificationUseCase,
    private readonly tenantPortalBaseUrl: string,
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
        let channel: NotificationChannel;
        let recipient: string;
        let effectiveTemplateCode: string;

        const effectiveEmail = contact?.effectiveEmail;
        const effectivePhone = contact?.effectivePhone;

        if (effectiveEmail) {
          channel = 'EMAIL';
          recipient = effectiveEmail;
          effectiveTemplateCode = templateCode;
        } else if (effectivePhone) {
          channel = 'SMS';
          recipient = effectivePhone;
          effectiveTemplateCode = `${templateCode}_SMS`;
        } else {
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

        const tenant = await this.tenantRepo.findById(appointment.tenantId);
        if (!tenant || !contact) {
          skipped++;
          continue;
        }

        const payloadJson = this.buildNotificationPayload.build({
          templateCode: effectiveTemplateCode,
          tenant,
          appointment,
          contact,
          rawPortalToken: null,
          portalBaseUrl: this.tenantPortalBaseUrl,
          appointmentCodeFormatter: this.appointmentCodeFormatter,
        });

        await this.createNotification.execute({
          tenantId: appointment.tenantId,
          appointmentId: appointment.id,
          recipient,
          channel,
          templateCode: effectiveTemplateCode,
          payloadJson,
        });
        dispatched++;
      }
    }

    return { dispatched, skipped };
  }
}
