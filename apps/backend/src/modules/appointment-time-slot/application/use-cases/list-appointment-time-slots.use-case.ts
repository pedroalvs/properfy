import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { IAppointmentTimeSlotRepository } from '../../domain/appointment-time-slot.repository';

export interface ListAppointmentTimeSlotsInput {
  tenantId?: string;
  branchId?: string;
  includeInactive?: boolean;
  actor: AuthContext;
}

export interface ListAppointmentTimeSlotsOutput {
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

const ALLOWED_ROLES = ['AM', 'OP', 'CL_ADMIN', 'CL_USER'] as const;

export class ListAppointmentTimeSlotsUseCase {
  constructor(private readonly timeSlotRepo: IAppointmentTimeSlotRepository) {}

  async execute(input: ListAppointmentTimeSlotsInput): Promise<ListAppointmentTimeSlotsOutput[]> {
    const { actor } = input;

    if (!ALLOWED_ROLES.includes(actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // AM/OP can query any tenant; CL_ADMIN/CL_USER can only query own tenant
    let tenantId: string;
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      tenantId = actor.tenantId!;
      if (input.tenantId && input.tenantId !== actor.tenantId) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Cannot list time slots for another tenant');
      }
    } else {
      // AM/OP: tenantId required from query
      tenantId = input.tenantId ?? actor.tenantId ?? '';
      if (!tenantId) {
        throw new ValidationError('tenantId is required for this role');
      }
    }

    const entities = await this.timeSlotRepo.findAll({
      tenantId,
      branchId: input.branchId,
      includeInactive: input.includeInactive,
    });

    return entities.map((e) => ({
      id: e.id,
      tenantId: e.tenantId,
      branchId: e.branchId,
      label: e.label,
      startTime: e.startTime,
      endTime: e.endTime,
      sortOrder: e.sortOrder,
      isActive: e.isActive,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }
}
