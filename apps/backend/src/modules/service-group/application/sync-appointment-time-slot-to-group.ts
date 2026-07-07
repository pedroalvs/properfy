import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../shared/infrastructure/audit';
import type { Logger } from '../../../shared/infrastructure/logger';
import type { IAppointmentRepository } from '../../appointment/domain/appointment.repository';
import { getServiceGroupTimeSlotAdjustment, type AppointmentTimeSlot } from '../domain/service-group-time-slot-sync';
import { getServiceGroupDateAdjustment } from '../domain/service-group-date-sync';

export type ServiceGroupTimeSyncLogger = Pick<Logger, 'error'>;

export interface AppointmentForServiceGroupScheduleSync extends AppointmentTimeSlot {
  id: string;
  tenantId: string;
  scheduledDate: Date;
}

export interface SyncAppointmentScheduleToGroupInput {
  appointmentRepo: IAppointmentRepository;
  auditService: AuditService;
  appointment: AppointmentForServiceGroupScheduleSync;
  groupTimeWindow: string;
  groupScheduledDate: Date;
  groupId: string;
  actor: AuthContext;
  logger: ServiceGroupTimeSyncLogger;
  /** Audit reason; defaults to the add/create wording. */
  reason?: string;
}

/**
 * Appointments always follow their group's schedule: the scheduled date is
 * replaced by the group's date when it differs, and the time slot is clamped
 * into the group's time window. Both land in a single update + audit entry.
 */
export async function syncAppointmentScheduleToGroup(input: SyncAppointmentScheduleToGroupInput): Promise<void> {
  const timeAdjustment = getServiceGroupTimeSlotAdjustment(input.appointment, input.groupTimeWindow);
  const dateAdjustment = getServiceGroupDateAdjustment(input.appointment.scheduledDate, input.groupScheduledDate);
  if (!timeAdjustment && !dateAdjustment) {
    return;
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const update: { timeSlotStart?: string; timeSlotEnd?: string; scheduledDate?: Date } = {};

  if (timeAdjustment) {
    update.timeSlotStart = timeAdjustment.timeSlotStart;
    update.timeSlotEnd = timeAdjustment.timeSlotEnd;
    before.timeSlotStart = timeAdjustment.before.timeSlotStart;
    before.timeSlotEnd = timeAdjustment.before.timeSlotEnd;
    after.timeSlotStart = timeAdjustment.timeSlotStart;
    after.timeSlotEnd = timeAdjustment.timeSlotEnd;
  }
  if (dateAdjustment) {
    update.scheduledDate = dateAdjustment.scheduledDate;
    before.scheduledDate = dateAdjustment.before.scheduledDate;
    after.scheduledDate = dateAdjustment.scheduledDate;
  }

  await input.appointmentRepo.update(input.appointment.id, input.appointment.tenantId, update);
  input.auditService.log({
    action: 'appointment.updated',
    actorType: 'SYSTEM',
    actorId: input.actor.userId,
    entityType: 'Appointment',
    entityId: input.appointment.id,
    tenantId: input.appointment.tenantId,
    before,
    after,
    reason: input.reason ?? 'Added to service group',
    metadata: {
      groupId: input.groupId,
      ...(timeAdjustment ? { automaticTimeSlotSync: true } : {}),
      ...(dateAdjustment ? { automaticDateSync: true } : {}),
    },
  });
}

export async function trySyncAppointmentScheduleToGroup(input: SyncAppointmentScheduleToGroupInput): Promise<void> {
  try {
    await syncAppointmentScheduleToGroup(input);
  } catch (err) {
    // The group/link write may already be committed. Schedule sync is best-effort
    // and must not make the caller report a false failure for a linked item.
    input.logger.error(
      {
        err,
        appointmentId: input.appointment.id,
        tenantId: input.appointment.tenantId,
        groupId: input.groupId,
      },
      'appointment schedule sync to group failed',
    );
  }
}
