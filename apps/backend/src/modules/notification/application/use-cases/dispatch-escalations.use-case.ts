import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { BuildNotificationPayloadService } from '../../domain/build-notification-payload.service';
import type { AppointmentCodeFormatter } from '../../../appointment/domain/appointment-code.formatter';
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
    private readonly tenantRepo: ITenantRepository,
    private readonly notificationRepo: INotificationRepository,
    private readonly buildNotificationPayload: BuildNotificationPayloadService,
    private readonly appointmentCodeFormatter: AppointmentCodeFormatter,
    private readonly createNotification: CreateNotificationUseCase,
    private readonly rentalTenantPortalBaseUrl: string,
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
      if (appointment.rentalTenantConfirmationStatus === 'CONFIRMED') {
        skipped++;
        continue;
      }

      const tenant = await this.tenantRepo.findById(appointment.tenantId);
      if (!tenant || !contact) {
        skipped++;
        continue;
      }

      const branch = await this.branchRepo.findById(appointment.branchId, appointment.tenantId);

      // H13: Track skipped per-channel independently to avoid per-appointment double-count
      let pmSkipped = false;
      let smsSkipped = false;

      // PM Escalation (EMAIL to branch contact)
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
            payloadJson: this.buildNotificationPayload.build({
              templateCode: 'PROPERTY_MANAGER_ESCALATION',
              tenant,
              appointment,
              contact,
              branchName: branch.name,
              rawPortalToken: null,
              portalBaseUrl: this.rentalTenantPortalBaseUrl,
              appointmentCodeFormatter: this.appointmentCodeFormatter,
            }),
          });
          pmEscalations++;
        } else {
          pmSkipped = true;
        }
      } else {
        pmSkipped = true;
      }

      // Tenant SMS Alert
      const effectivePhone = contact.effectivePhone;
      if (effectivePhone) {
        const smsAlreadySent = await this.notificationRepo.existsByAppointmentAndTemplate(
          appointment.id,
          'TENANT_SMS_ALERT',
        );
        if (!smsAlreadySent) {
          await this.createNotification.execute({
            tenantId: appointment.tenantId,
            appointmentId: appointment.id,
            recipient: effectivePhone,
            channel: 'SMS',
            templateCode: 'TENANT_SMS_ALERT',
            payloadJson: this.buildNotificationPayload.build({
              templateCode: 'TENANT_SMS_ALERT',
              tenant,
              appointment,
              contact,
              rawPortalToken: null,
              portalBaseUrl: this.rentalTenantPortalBaseUrl,
              appointmentCodeFormatter: this.appointmentCodeFormatter,
            }),
          });
          smsAlerts++;
        } else {
          smsSkipped = true;
        }
      } else {
        smsSkipped = true;
      }

      // Count appointment as skipped when at least one channel was not actioned
      if (pmSkipped || smsSkipped) skipped++;
    }

    return { pmEscalations, smsAlerts, skipped };
  }
}
