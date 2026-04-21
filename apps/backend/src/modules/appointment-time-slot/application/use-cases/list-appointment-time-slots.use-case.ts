import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
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

export class ListAppointmentTimeSlotsUseCase {
  constructor(
    private readonly timeSlotRepo: IAppointmentTimeSlotRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListAppointmentTimeSlotsInput): Promise<ListAppointmentTimeSlotsOutput[]> {
    const { actor } = input;

    // Management page only — spec 012 contracts line 56 explicitly forbids
    // CL_USER and INSP on GET /v1/time-slots. CL_USER consumes time slots
    // via GET /v1/time-slots/effective (the effective resolution endpoint)
    // which powers the appointment form dropdown. See specs/DECISIONS.md
    // DEC-002.
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'appointment_time_slot.list',
      entityType: 'AppointmentTimeSlot',
    });

    // AM/OP can query any tenant; CL_ADMIN is pinned to their own tenant.
    // Resolve explicitly instead of chaining `?? ''` — empty string is not
    // a valid tenant_id and was only used previously as a "missing value"
    // placeholder, which is exactly the kind of sentinel we are removing
    // (see specs/DECISIONS.md DEC-003).
    let tenantId: string;
    if (actor.role === 'CL_ADMIN') {
      if (input.tenantId && input.tenantId !== actor.tenantId) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Cannot list time slots for another tenant');
      }
      tenantId = actor.tenantId!;
    } else {
      // AM/OP: tenantId required from query; own JWT tenant is a legit
      // fallback only when it's non-null (AM/OP with null JWT tenantId
      // must pass an explicit `input.tenantId`).
      const resolved = input.tenantId ?? actor.tenantId ?? null;
      if (!resolved) {
        throw new ValidationError('tenantId is required for this role');
      }
      tenantId = resolved;
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
