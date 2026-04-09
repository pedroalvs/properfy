import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IAppointmentTimeSlotRepository } from '../../domain/appointment-time-slot.repository';
import { AppointmentTimeSlotEntity } from '../../domain/appointment-time-slot.entity';
import { AppointmentTimeSlotOverlapError } from '../../domain/appointment-time-slot.errors';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import { BranchNotFoundError } from '../../../tenant/domain/tenant.errors';

export interface CreateAppointmentTimeSlotInput {
  tenantId?: string;
  branchId?: string | null;
  label: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  actor: AuthContext;
}

export interface CreateAppointmentTimeSlotOutput {
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

export class CreateAppointmentTimeSlotUseCase {
  constructor(
    private readonly timeSlotRepo: IAppointmentTimeSlotRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: CreateAppointmentTimeSlotInput): Promise<CreateAppointmentTimeSlotOutput> {
    const { actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'appointment_time_slot.create',
      entityType: 'AppointmentTimeSlot',
    });

    // CL_ADMIN can only create for own tenant
    const tenantId = actor.role === 'CL_ADMIN'
      ? actor.tenantId!
      : (input.tenantId ?? actor.tenantId!);

    if (actor.role === 'CL_ADMIN' && input.tenantId && input.tenantId !== actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Cannot create time slots for another tenant');
    }

    if (input.startTime >= input.endTime) {
      throw new ValidationError('End time must be after start time');
    }

    if (input.branchId) {
      const branch = await this.branchRepo.findById(input.branchId, tenantId);
      if (!branch) {
        throw new BranchNotFoundError();
      }
    }

    // Overlap detection (FR-003b): reject overlapping ranges in the same scope
    const existingSlots = await this.timeSlotRepo.findActiveInScope(tenantId, input.branchId ?? null);
    for (const existing of existingSlots) {
      if (input.startTime < existing.endTime && input.endTime > existing.startTime) {
        throw new AppointmentTimeSlotOverlapError(existing.startTime, existing.endTime);
      }
    }

    const now = new Date();
    const id = crypto.randomUUID();

    const entity = new AppointmentTimeSlotEntity({
      id,
      tenantId,
      branchId: input.branchId ?? null,
      label: input.label,
      startTime: input.startTime,
      endTime: input.endTime,
      sortOrder: input.sortOrder,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.timeSlotRepo.create(entity);

    this.auditService.log({
      action: 'appointment_time_slot.created',
      actorType: 'USER',
      actorId: actor.userId,
      tenantId,
      entityType: 'AppointmentTimeSlot',
      entityId: id,
      after: {
        id,
        tenantId,
        branchId: entity.branchId,
        label: entity.label,
        startTime: entity.startTime,
        endTime: entity.endTime,
        sortOrder: entity.sortOrder,
      },
    });

    return {
      id: entity.id,
      tenantId: entity.tenantId,
      branchId: entity.branchId,
      label: entity.label,
      startTime: entity.startTime,
      endTime: entity.endTime,
      sortOrder: entity.sortOrder,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
