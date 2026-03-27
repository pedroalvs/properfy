import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IAppointmentTimeSlotRepository } from '../../domain/appointment-time-slot.repository';
import { AppointmentTimeSlotEntity } from '../../domain/appointment-time-slot.entity';
import { AppointmentTimeSlotNotFoundError } from '../../domain/appointment-time-slot.errors';

export interface UpdateAppointmentTimeSlotInput {
  timeSlotId: string;
  data: {
    label?: string;
    startTime?: string;
    endTime?: string;
    sortOrder?: number;
    isActive?: boolean;
  };
  actor: AuthContext;
}

export interface UpdateAppointmentTimeSlotOutput {
  id: string;
  tenantId: string;
  branchId: string | null;
  label: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ALLOWED_ROLES = ['AM', 'OP', 'CL_ADMIN'] as const;

export class UpdateAppointmentTimeSlotUseCase {
  constructor(
    private readonly timeSlotRepo: IAppointmentTimeSlotRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateAppointmentTimeSlotInput): Promise<UpdateAppointmentTimeSlotOutput> {
    const { timeSlotId, data, actor } = input;

    if (!ALLOWED_ROLES.includes(actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const existing = await this.timeSlotRepo.findById(timeSlotId);
    if (!existing) {
      throw new AppointmentTimeSlotNotFoundError();
    }

    // CL_ADMIN can only update slots for own tenant
    if (actor.role === 'CL_ADMIN' && existing.tenantId !== actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Cannot update time slots for another tenant');
    }

    const before = {
      label: existing.label,
      startTime: existing.startTime,
      endTime: existing.endTime,
      sortOrder: existing.sortOrder,
      isActive: existing.isActive,
    };

    const now = new Date();
    const nextStartTime = data.startTime ?? existing.startTime;
    const nextEndTime = data.endTime ?? existing.endTime;

    if (nextStartTime >= nextEndTime) {
      throw new ValidationError('End time must be after start time');
    }

    const updated = new AppointmentTimeSlotEntity({
      id: existing.id,
      tenantId: existing.tenantId,
      branchId: existing.branchId,
      label: data.label ?? existing.label,
      startTime: nextStartTime,
      endTime: nextEndTime,
      sortOrder: data.sortOrder ?? existing.sortOrder,
      isActive: data.isActive ?? existing.isActive,
      createdAt: existing.createdAt,
      updatedAt: now,
      deletedAt: existing.deletedAt,
    });

    await this.timeSlotRepo.update(updated);

    const after = {
      label: updated.label,
      startTime: updated.startTime,
      endTime: updated.endTime,
      sortOrder: updated.sortOrder,
      isActive: updated.isActive,
    };

    this.auditService.log({
      action: 'appointment_time_slot.updated',
      actorType: 'USER',
      actorId: actor.userId,
      tenantId: existing.tenantId,
      entityType: 'AppointmentTimeSlot',
      entityId: timeSlotId,
      before,
      after,
    });

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      branchId: updated.branchId,
      label: updated.label,
      startTime: updated.startTime,
      endTime: updated.endTime,
      sortOrder: updated.sortOrder,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
