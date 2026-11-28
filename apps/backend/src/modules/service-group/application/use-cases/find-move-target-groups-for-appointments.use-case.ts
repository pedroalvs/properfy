import type { AuthContext } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import { moveTargetLowerBoundDate, isCurrentDayGroup } from '../../domain/group-move-eligibility';

export interface MoveTargetGroupSummary {
  id: string;
  groupNumber: number;
  code: string;
  status: string;
  scheduledDate: Date;
  timeWindow: string;
  currentSize: number;
  serviceTypeName: string | null;
  /** True when the group is scheduled for the current Sydney civil day. */
  isCurrentDay: boolean;
}

export interface FindMoveTargetGroupsOutput {
  groups: MoveTargetGroupSummary[];
  /** Populated when early-exit pre-conditions fail; groups will be empty. */
  reason?: 'MIXED_APPOINTMENT_PROPERTIES' | 'INVALID_APPOINTMENT_STATUS' | 'NOT_GROUPED';
}

/** Statuses a live group member can hold (and therefore be moved from). */
const MOVABLE_MEMBER_STATUSES = new Set(['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED']);

/**
 * Returns the active groups that can be a MOVE destination for ALL of the given
 * appointments. Pre-filters server-side so the destination picker only lists groups
 * the operator can actually use.
 *
 * Pre-conditions (groups empty + a reason when any fails):
 *  - all appointments share one serviceTypeId (MIXED_APPOINTMENT_PROPERTIES);
 *  - all are in a movable status (INVALID_APPOINTMENT_STATUS);
 *  - all are already in a group (NOT_GROUPED) — a move relinks an existing member,
 *    an ungrouped appointment uses the add-to-group flow instead.
 *
 * Destination bounds (applied by the repository query):
 *  - same serviceType, status ∈ {DRAFT, PUBLISHED, ACCEPTED}, spare capacity;
 *  - scheduled today or later, with today excluded after the 18:50 Sydney cutoff;
 *  - the appointments' own current groups are excluded (never move into itself).
 */
export class FindMoveTargetGroupsForAppointmentsUseCase {
  constructor(
    private readonly groupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { appointmentIds: string[]; actor: AuthContext }): Promise<FindMoveTargetGroupsOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'appointment.move_to_group',
      entityType: 'ServiceGroup',
    });

    const appointments = await Promise.all(
      input.appointmentIds.map((id) => this.appointmentRepo.findById(id, null)),
    );
    const valid = appointments.filter((r) => r !== null).map((r) => r!.appointment);
    if (valid.length === 0) return { groups: [] };

    const first = valid[0]!;

    if (valid.some((a) => a.serviceTypeId !== first.serviceTypeId)) {
      return { groups: [], reason: 'MIXED_APPOINTMENT_PROPERTIES' };
    }
    if (valid.some((a) => !MOVABLE_MEMBER_STATUSES.has(a.status))) {
      return { groups: [], reason: 'INVALID_APPOINTMENT_STATUS' };
    }
    // Move-only: every selected appointment must already belong to a group.
    if (valid.some((a) => a.serviceGroupId === null)) {
      return { groups: [], reason: 'NOT_GROUPED' };
    }

    const now = this.clock();
    const excludeGroupIds = [...new Set(valid.map((a) => a.serviceGroupId!).filter(Boolean))];

    const groups = await this.groupRepo.findMoveTargetsForAppointments({
      serviceTypeId: first.serviceTypeId,
      batchSize: input.appointmentIds.length,
      lowerBoundDate: moveTargetLowerBoundDate(now, PLATFORM_TIMEZONE),
      excludeGroupIds,
    });

    return {
      groups: groups.map((g) => ({
        ...g,
        isCurrentDay: isCurrentDayGroup(g.scheduledDate, now, PLATFORM_TIMEZONE),
      })),
    };
  }
}

/** Exposed for the route layer so it does not re-derive the civil-date rendering. */
export function moveTargetSummaryToWire(g: MoveTargetGroupSummary): Omit<MoveTargetGroupSummary, 'scheduledDate'> & {
  scheduledDate: string;
} {
  return {
    ...g,
    scheduledDate: civilDateInTimezone(g.scheduledDate, PLATFORM_TIMEZONE),
  };
}
