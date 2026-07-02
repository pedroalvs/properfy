import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../shared/infrastructure/audit';
import type { IAppointmentRepository } from '../../appointment/domain/appointment.repository';
import { getServiceGroupTimeSlotAdjustment, type AppointmentTimeSlot } from '../domain/service-group-time-slot-sync';

export interface AppointmentForServiceGroupTimeSync extends AppointmentTimeSlot {
  id: string;
  tenantId: string;
}

export interface SyncAppointmentTimeSlotToGroupInput {
  appointmentRepo: IAppointmentRepository;
  auditService: AuditService;
  appointment: AppointmentForServiceGroupTimeSync;
  groupTimeWindow: string;
  groupId: string;
  actor: AuthContext;
}

export async function syncAppointmentTimeSlotToGroup(input: SyncAppointmentTimeSlotToGroupInput): Promise<void> {
  const adjustment = getServiceGroupTimeSlotAdjustment(input.appointment, input.groupTimeWindow);
  if (!adjustment) {
    return;
  }

  await input.appointmentRepo.update(input.appointment.id, input.appointment.tenantId, {
    timeSlotStart: adjustment.timeSlotStart,
    timeSlotEnd: adjustment.timeSlotEnd,
  });
  input.auditService.log({
    action: 'appointment.updated',
    actorType: 'SYSTEM',
    actorId: input.actor.userId,
    entityType: 'Appointment',
    entityId: input.appointment.id,
    tenantId: input.appointment.tenantId,
    before: adjustment.before,
    after: {
      timeSlotStart: adjustment.timeSlotStart,
      timeSlotEnd: adjustment.timeSlotEnd,
    },
    reason: 'Added to service group',
    metadata: { groupId: input.groupId, automaticTimeSlotSync: true },
  });
}

export async function trySyncAppointmentTimeSlotToGroup(input: SyncAppointmentTimeSlotToGroupInput): Promise<void> {
  try {
    await syncAppointmentTimeSlotToGroup(input);
  } catch {
    // The group/link write may already be committed. Time sync is best-effort
    // and must not make the caller report a false failure for a linked item.
  }
}
