import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IAppointmentTimeSlotRepository } from '../../domain/appointment-time-slot.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import { BranchNotFoundError } from '../../../tenant/domain/tenant.errors';

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
  constructor(
    private readonly timeSlotRepo: IAppointmentTimeSlotRepository,
    private readonly branchRepo: IBranchRepository,
  ) {}

  async execute(input: ListEffectiveTimeSlotsInput): Promise<EffectiveTimeSlotOutput[]> {
    const { actor } = input;

    if (!ALLOWED_ROLES.includes(actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // AM/OP can query any tenant; when no tenant is provided, derive it from the branch itself.
    let tenantId = (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER')
      ? actor.tenantId!
      : (input.tenantId ?? actor.tenantId ?? undefined);

    if ((actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') &&
        input.tenantId && input.tenantId !== actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Cannot list time slots for another tenant');
    }

    if (!tenantId) {
      const branch = await this.branchRepo.findById(input.branchId, '');
      if (!branch) {
        throw new BranchNotFoundError();
      }
      tenantId = branch.tenantId;
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
