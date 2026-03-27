import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IAppointmentTimeSlotRepository } from '../../domain/appointment-time-slot.repository';

export interface ListEffectiveTimeSlotsInput {
  branchId: string;
  tenantId?: string;
  actor: AuthContext;
}

export interface EffectiveTimeSlotOutput {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  value: string; // "HH:mm-HH:mm" composite
}

const ALLOWED_ROLES = ['AM', 'OP', 'CL_ADMIN', 'CL_USER'] as const;

export class ListEffectiveTimeSlotsUseCase {
  constructor(private readonly timeSlotRepo: IAppointmentTimeSlotRepository) {}

  async execute(input: ListEffectiveTimeSlotsInput): Promise<EffectiveTimeSlotOutput[]> {
    const { actor } = input;

    if (!ALLOWED_ROLES.includes(actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // AM/OP can query any tenant; others use own tenant
    const tenantId = (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER')
      ? actor.tenantId!
      : (input.tenantId ?? actor.tenantId!);

    if ((actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') &&
        input.tenantId && input.tenantId !== actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Cannot list time slots for another tenant');
    }

    const entities = await this.timeSlotRepo.findEffective(tenantId, input.branchId);

    return entities.map((e) => ({
      id: e.id,
      label: e.label,
      startTime: e.startTime,
      endTime: e.endTime,
      value: e.compositeValue,
    }));
  }
}
