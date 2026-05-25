import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';
import { AppointmentStateMachine } from '../../domain/appointment-state-machine';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';

const REJECTION_REASON = 'Tenant did not respond to confirmation request';
const GROUP_CANCEL_REASON = 'All appointments removed due to non-response cleanup';

export interface RejectUnconfirmedAppointmentsOutput {
  rejectedCount: number;
  groupsClosedCount: number;
  groupsUpdatedCount: number;
}

export class RejectUnconfirmedAppointmentsUseCase {
  private readonly stateMachine = new AppointmentStateMachine();

  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<RejectUnconfirmedAppointmentsOutput> {
    // Calculate tomorrow's date (UTC)
    const now = new Date();
    const tomorrow = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ));

    // Find appointments scheduled for tomorrow that are unconfirmed and in active status
    const appointments = await this.appointmentRepo.findUnconfirmedForDate(tomorrow);

    if (appointments.length === 0) {
      this.logger.info('No unconfirmed appointments found for tomorrow');
      return { rejectedCount: 0, groupsClosedCount: 0, groupsUpdatedCount: 0 };
    }

    let rejectedCount = 0;
    const affectedGroupIds = new Set<string>();

    for (const appointment of appointments) {
      try {
        // Validate the transition is allowed for SYS actor
        const validation = this.stateMachine.validateTransition(
          appointment.status,
          'REJECTED',
          'SYS',
        );

        if (!validation.valid) {
          this.logger.warn(
            { appointmentId: appointment.id, status: appointment.status },
            `Cannot transition appointment from ${appointment.status} to REJECTED as SYS: ${validation.error}`,
          );
          continue;
        }

        const previousStatus = appointment.status;

        // Update appointment: reject, set reason code, update confirmation status, remove from group
        await this.appointmentRepo.update(appointment.id, appointment.tenantId, {
          status: 'REJECTED',
          reason: REJECTION_REASON,
          rejectionReasonCode: 'TENANT_NO_RESPONSE',
          tenantConfirmationStatus: 'NO_RESPONSE',
          serviceGroupId: null,
        });

        // Track affected groups (before clearing the serviceGroupId)
        if (appointment.serviceGroupId) {
          affectedGroupIds.add(appointment.serviceGroupId);
        }

        // Audit log
        this.auditService.log({
          action: 'appointment.status_transition',
          actorType: 'SYSTEM',
          entityType: 'Appointment',
          entityId: appointment.id,
          tenantId: appointment.tenantId,
          before: {
            status: previousStatus,
            tenantConfirmationStatus: appointment.tenantConfirmationStatus,
            serviceGroupId: appointment.serviceGroupId,
          },
          after: {
            status: 'REJECTED',
            tenantConfirmationStatus: 'NO_RESPONSE',
            rejectionReasonCode: 'TENANT_NO_RESPONSE',
            serviceGroupId: null,
          },
          reason: REJECTION_REASON,
          metadata: { trigger: 'daily_unconfirmed_cleanup' },
        });

        rejectedCount++;
      } catch (err) {
        this.logger.error(
          { appointmentId: appointment.id, err },
          'Failed to reject unconfirmed appointment',
        );
      }
    }

    // Process affected service groups
    let groupsClosedCount = 0;
    let groupsUpdatedCount = 0;

    for (const groupId of affectedGroupIds) {
      try {
        const groupData = await this.serviceGroupRepo.findById(groupId, null);
        if (!groupData) continue;

        const remainingAppointments = groupData.appointments.filter(
          (a) => a.serviceGroupId === groupId,
        );

        if (remainingAppointments.length === 0) {
          // No remaining appointments — cancel the group
          await this.serviceGroupRepo.update(groupId, {
            status: 'CANCELLED',
          });

          this.auditService.log({
            action: 'service_group.cancelled',
            actorType: 'SYSTEM',
            entityType: 'ServiceGroup',
            entityId: groupId,
            tenantId: groupData.group.tenantId,
            before: { status: groupData.group.status },
            after: { status: 'CANCELLED' },
            reason: GROUP_CANCEL_REASON,
            metadata: { trigger: 'daily_unconfirmed_cleanup' },
          });

          groupsClosedCount++;
        } else {
          // Group still has appointments — update group size/counts
          await this.serviceGroupRepo.update(groupId, {
            offeredCount: remainingAppointments.length,
            confirmedCount: remainingAppointments.length,
          });

          groupsUpdatedCount++;
        }
      } catch (err) {
        this.logger.error(
          { groupId, err },
          'Failed to process service group after unconfirmed cleanup',
        );
      }
    }

    this.logger.info(
      { rejectedCount, groupsClosedCount, groupsUpdatedCount },
      'Unconfirmed appointment cleanup completed',
    );

    return { rejectedCount, groupsClosedCount, groupsUpdatedCount };
  }
}
