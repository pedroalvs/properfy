import type { PrismaClient, Prisma } from '@prisma/client';
import { formatCivilDate, type SystemInspectorNoticeType } from '@properfy/shared';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';
import type { ConfirmationCycleService } from '../services/confirmation-cycle.service';
import { AppointmentStateMachine } from '../../domain/appointment-state-machine';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';

const REJECTION_REASON = 'Tenant did not respond to confirmation request';
const GROUP_CANCEL_REASON = 'All appointments removed due to non-response cleanup';

/** Inspector notice type raised for the inspector whose accepted job the sweep rejects. */
const INSPECTOR_NOTICE_TYPE: SystemInspectorNoticeType = 'APPOINTMENT_AUTO_REJECTED';

/**
 * Agency-facing notification seam. Satisfied by the notification module's
 * `NotifyOnStatusTransitionHandler`, which sends the existing
 * `INSPECTION_REJECTED_AGENCY` email (its cue to reschedule). The sweep writes
 * the rejection directly (it does not go through `ExecuteStatusTransitionUseCase`),
 * so without this the agency was never told.
 */
export interface IRejectUnconfirmedAgencyNotifier {
  execute(input: {
    appointmentId: string;
    tenantId?: string | null;
    previousStatus: string;
    targetStatus: string;
  }): Promise<void>;
}

/**
 * Inspector-facing notification seam. Satisfied by the inspector-notice module's
 * `PublishSystemInspectorNoticeUseCase`: an in-app Announcement + push so the
 * inspector who had accepted the job is told it was removed instead of it silently
 * vanishing from the schedule. Idempotent by `dedupeKey`.
 */
export interface IRejectUnconfirmedInspectorNotifier {
  execute(input: {
    type: SystemInspectorNoticeType;
    inspectorIds: string[];
    title: string;
    body: string;
    dedupeKey: string;
    targetPath?: string;
    requestId?: string;
  }): Promise<{ noticeId: string | null; created: boolean }>;
}

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
    /** 028 — optional. When wired, supersedes the confirmation cycle per rejected appointment. */
    private readonly cycleService?: ConfirmationCycleService,
    private readonly prisma?: PrismaClient,
    /** Optional. When wired, emails the agency its reschedule cue (INSPECTION_REJECTED_AGENCY). */
    private readonly agencyNotifier?: IRejectUnconfirmedAgencyNotifier,
    /** Optional. When wired, tells the assigned inspector their accepted job was removed. */
    private readonly inspectorNotifier?: IRejectUnconfirmedInspectorNotifier,
  ) {}

  async execute(scope?: { timezone: string; todayCivil?: string; tenantIds: string[] }): Promise<RejectUnconfirmedAppointmentsOutput> {
    // Tomorrow as a civil date — derived from the CLAIMED agency-local date for
    // scoped (per-tenant tick) runs so claim and execution always agree,
    // platform otherwise; the repo expects UTC midnight of that civil date.
    const now = new Date();
    const todayCivil = scope?.todayCivil ?? civilDateInTimezone(now, PLATFORM_TIMEZONE);
    const tomorrow = new Date(`${todayCivil}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    // Find appointments scheduled for tomorrow that are unconfirmed and in active status
    const appointments = await this.appointmentRepo.findUnconfirmedForDate(tomorrow, scope?.tenantIds);

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
        // Captured before the reject nulls it: only a SCHEDULED job has an inspector
        // assigned (it was accepted), and that inspector must be told it was removed.
        const assignedInspectorId = appointment.inspectorId;

        // Update appointment: reject, set reason code, update confirmation status, remove from group.
        // When cycleService is wired, supersede the active cycle atomically.
        const doReject = async (tx?: Prisma.TransactionClient) => {
          await this.appointmentRepo.update(appointment.id, appointment.tenantId, {
            status: 'REJECTED',
            reason: REJECTION_REASON,
            rejectionReasonCode: 'TENANT_NO_RESPONSE',
            rentalTenantConfirmationStatus: 'NO_RESPONSE',
            serviceGroupId: null,
            // Match the manual reject invariant: a rejected appointment keeps no
            // inspector. This sweep DOES reject accepted SCHEDULED jobs (which carry
            // an assigned inspector — that inspector is notified below), so nulling
            // the inspector here actively releases them; for an AWAITING_INSPECTOR
            // member it is a no-op. Either way "rejected => no inspector" holds.
            inspectorId: null,
          }, tx);
          if (this.cycleService) {
            await this.cycleService.invalidateOnReject(appointment.id, appointment.tenantId, tx);
          }
        };

        if (this.cycleService && this.prisma) {
          await this.prisma.$transaction((tx) => doReject(tx));
        } else {
          await doReject();
        }

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
            rentalTenantConfirmationStatus: appointment.rentalTenantConfirmationStatus,
            serviceGroupId: appointment.serviceGroupId,
          },
          after: {
            status: 'REJECTED',
            rentalTenantConfirmationStatus: 'NO_RESPONSE',
            rejectionReasonCode: 'TENANT_NO_RESPONSE',
            serviceGroupId: null,
          },
          reason: REJECTION_REASON,
          metadata: { trigger: 'daily_unconfirmed_cleanup' },
        });

        rejectedCount++;

        // Notify after the reject committed. Both legs are best-effort: a failure is
        // logged but must never abort the sweep or roll back the rejection. They are
        // idempotent — the appointment is now REJECTED, so the next run's
        // `findUnconfirmedForDate` skips it (agency leg), and the inspector notice
        // dedupes by `appointmentId`.
        if (this.agencyNotifier) {
          try {
            await this.agencyNotifier.execute({
              appointmentId: appointment.id,
              tenantId: appointment.tenantId,
              previousStatus,
              targetStatus: 'REJECTED',
            });
          } catch (err) {
            this.logger.error(
              { appointmentId: appointment.id, err },
              'Failed to notify agency of auto-rejected appointment',
            );
          }
        }

        if (this.inspectorNotifier && assignedInspectorId) {
          try {
            const dateLabel = formatCivilDate(appointment.scheduledDate);
            await this.inspectorNotifier.execute({
              type: INSPECTOR_NOTICE_TYPE,
              inspectorIds: [assignedInspectorId],
              title: 'Job removed from your schedule',
              body: dateLabel
                ? `A job scheduled for ${dateLabel} was cancelled because the rental tenant didn't confirm in time. It has been removed from your schedule.`
                : `A job was cancelled because the rental tenant didn't confirm in time. It has been removed from your schedule.`,
              dedupeKey: `appointment-auto-rejected:${appointment.id}`,
            });
          } catch (err) {
            this.logger.error(
              { appointmentId: appointment.id, err },
              'Failed to notify inspector of auto-rejected appointment',
            );
          }
        }
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
            tenantId: groupData.primaryTenantId,
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
