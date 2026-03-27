import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IAppointmentTimeSlotRepository } from '../../domain/appointment-time-slot.repository';
import { AppointmentTimeSlotNotFoundError } from '../../domain/appointment-time-slot.errors';

export interface DeleteAppointmentTimeSlotInput {
  timeSlotId: string;
  actor: AuthContext;
}

const ALLOWED_ROLES = ['AM', 'OP', 'CL_ADMIN'] as const;

export class DeleteAppointmentTimeSlotUseCase {
  constructor(
    private readonly timeSlotRepo: IAppointmentTimeSlotRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeleteAppointmentTimeSlotInput): Promise<void> {
    const { timeSlotId, actor } = input;

    if (!ALLOWED_ROLES.includes(actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const existing = await this.timeSlotRepo.findById(timeSlotId);
    if (!existing) {
      throw new AppointmentTimeSlotNotFoundError();
    }

    // CL_ADMIN can only delete slots for own tenant
    if (actor.role === 'CL_ADMIN' && existing.tenantId !== actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Cannot delete time slots for another tenant');
    }

    await this.timeSlotRepo.softDelete(timeSlotId);

    this.auditService.log({
      action: 'appointment_time_slot.deleted',
      actorType: 'USER',
      actorId: actor.userId,
      tenantId: existing.tenantId,
      entityType: 'AppointmentTimeSlot',
      entityId: timeSlotId,
      before: {
        id: existing.id,
        label: existing.label,
        startTime: existing.startTime,
        endTime: existing.endTime,
      },
    });
  }
}
