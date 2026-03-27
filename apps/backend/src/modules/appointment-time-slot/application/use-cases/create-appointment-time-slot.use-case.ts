import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IAppointmentTimeSlotRepository } from '../../domain/appointment-time-slot.repository';
import { AppointmentTimeSlotEntity } from '../../domain/appointment-time-slot.entity';

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

const ALLOWED_ROLES = ['AM', 'OP', 'CL_ADMIN'] as const;

export class CreateAppointmentTimeSlotUseCase {
  constructor(
    private readonly timeSlotRepo: IAppointmentTimeSlotRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateAppointmentTimeSlotInput): Promise<CreateAppointmentTimeSlotOutput> {
    const { actor } = input;

    if (!ALLOWED_ROLES.includes(actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // CL_ADMIN can only create for own tenant
    const tenantId = actor.role === 'CL_ADMIN'
      ? actor.tenantId!
      : (input.tenantId ?? actor.tenantId!);

    if (actor.role === 'CL_ADMIN' && input.tenantId && input.tenantId !== actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Cannot create time slots for another tenant');
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
