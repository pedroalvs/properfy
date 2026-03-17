import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { CreateNotificationUseCase } from './create-notification.use-case';

export interface DispatchEscalationsOutput {
  pmEscalations: number;
  smsAlerts: number;
  skipped: number;
}

const ESCALATION_OFFSET_DAYS = 2;

export class DispatchEscalationsUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly notificationRepo: INotificationRepository,
    private readonly createNotification: CreateNotificationUseCase,
  ) {}

  async execute(today?: Date): Promise<DispatchEscalationsOutput> {
    const now = today ?? new Date();
    let pmEscalations = 0;
    let smsAlerts = 0;
    let skipped = 0;

    const targetDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ESCALATION_OFFSET_DAYS),
    );
    const appointments = await this.appointmentRepo.findScheduledOnDate(targetDate);

    for (const { appointment, contact } of appointments) {
      if (appointment.tenantConfirmationStatus === 'CONFIRMED') {
        skipped++;
        continue;
      }

      // PM Escalation (EMAIL)
      const branch = await this.branchRepo.findById(appointment.branchId, appointment.tenantId);
      if (branch?.contactEmail) {
        const pmAlreadySent = await this.notificationRepo.existsByAppointmentAndTemplate(
          appointment.id,
          'PROPERTY_MANAGER_ESCALATION',
        );
        if (!pmAlreadySent) {
          await this.createNotification.execute({
            tenantId: appointment.tenantId,
            appointmentId: appointment.id,
            recipient: branch.contactEmail,
            channel: 'EMAIL',
            templateCode: 'PROPERTY_MANAGER_ESCALATION',
            payloadJson: {
              tenantName: contact?.tenantName ?? '',
              scheduledDate: appointment.scheduledDate.toISOString().split('T')[0],
              timeSlot: appointment.timeSlot,
              appointmentReference: appointment.id,
              branchName: branch.name,
            },
          });
          pmEscalations++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }

      // Tenant SMS Alert
      if (contact?.primaryPhone) {
        const smsAlreadySent = await this.notificationRepo.existsByAppointmentAndTemplate(
          appointment.id,
          'TENANT_SMS_ALERT',
        );
        if (!smsAlreadySent) {
          await this.createNotification.execute({
            tenantId: appointment.tenantId,
            appointmentId: appointment.id,
            recipient: contact.primaryPhone,
            channel: 'SMS',
            templateCode: 'TENANT_SMS_ALERT',
            payloadJson: {
              tenantName: contact.tenantName,
              scheduledDate: appointment.scheduledDate.toISOString().split('T')[0],
              timeSlot: appointment.timeSlot,
            },
          });
          smsAlerts++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    return { pmEscalations, smsAlerts, skipped };
  }
}
