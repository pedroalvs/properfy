import { validateNewSchedule, PLATFORM_TIMEZONE, isTerminalAppointmentStatus, type AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { ServiceGroupEntity } from '../../domain/service-group.entity';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  AppointmentInvalidStatusError,
  ServiceRegionRequiredError,
  ServiceRegionInactiveError,
  ServiceGroupEmptyError,
  ServiceGroupDateInPastError,
  ServiceGroupTimeInPastError,
} from '../../domain/service-group.errors';

export interface PublishServiceGroupInput {
  groupId: string;
  actor: AuthContext;
}

export interface PublishServiceGroupOutput {
  id: string;
  tenantId: string | null;
  serviceTypeId: string;
  status: string;
  groupSize: number;
  offeredCount: number;
  confirmedCount: number;
  scheduledDate: Date;
  timeWindow: string;
  regionName: string | null;
  description: string | null;
  assignedInspectorId: string | null;
  serviceRegionId: string | null;
  publishedAt: Date | null;
  assignedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PublishServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly serviceRegionRepo: IServiceRegionRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: PublishServiceGroupInput): Promise<PublishServiceGroupOutput> {
    const { actor, groupId } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_group.publish', entityType: 'ServiceGroup' });

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group, appointments, primaryTenantId } = result;

    // Idempotency: if already PUBLISHED, return current state without side effects
    if (group.status === 'PUBLISHED') {
      return mapGroupToOutput(group, primaryTenantId);
    }

    if (!group.canPublish()) {
      throw new ServiceGroupInvalidStatusError('DRAFT', group.status);
    }

    // Publishing is the moment the group becomes a live marketplace offer, so
    // the two invariants an offer cannot violate are asserted here rather than
    // on the way back to DRAFT — republish stays unrestricted precisely so the
    // operator can land in DRAFT and repair the group.
    //
    // A group with nothing to release is reachable in one click, by two different
    // routes, so this needs its own guard rather than relying on the status loop
    // below (which is vacuous over an empty array):
    //   - operator cancel/reject unlinks every appointment, and republish does not
    //     re-link them, so those groups come back with no members at all;
    //   - the empty-group cleanup cancels without unlinking, so *those* groups come
    //     back still carrying their terminal members.
    // Counting live members rather than rows covers both. Without that, the second
    // route reaches the per-appointment status check further down and fails with a
    // confusing "appointment #N has an invalid status" instead of saying the group
    // has nothing to publish. Soft-deleted appointments are already excluded by the
    // repository, so the count is trustworthy.
    const liveAppointments = appointments.filter((a) => !isTerminalAppointmentStatus(a.status));
    if (liveAppointments.length === 0) {
      throw new ServiceGroupEmptyError();
    }

    // `validateNewSchedule` (not the edited variant) because publishing is a
    // release, not an edit: there is no unchanged field to grandfather. Same
    // Sydney-based rule used by create/update — past day, or today with a
    // window that has already started.
    const scheduleCheck = validateNewSchedule({
      date: group.scheduledDate.toISOString().slice(0, 10),
      timeSlot: group.timeWindow,
      tz: PLATFORM_TIMEZONE,
    });
    if (!scheduleCheck.ok) {
      throw scheduleCheck.code === 'TIME_IN_PAST'
        ? new ServiceGroupTimeInPastError()
        : new ServiceGroupDateInPastError();
    }

    // Single-agency groups must carry an active region to publish (spec 005
    // FR-007); mixed-agency groups have no single region and rely on
    // per-appointment region matching in the marketplace, so the requirement is
    // skipped for them. Region ownership is cross-tenant (`sr.tenant_id` is not a
    // matching filter), so the attached region is validated by id only.
    if (primaryTenantId) {
      if (!group.serviceRegionId) {
        throw new ServiceRegionRequiredError();
      }
      const region = await this.serviceRegionRepo.findById(group.serviceRegionId, null);
      if (!region) {
        throw new ServiceRegionInactiveError();
      }
      if (region.status !== 'ACTIVE') {
        throw new ServiceRegionInactiveError();
      }
    }

    // Verify all appointments are still AWAITING_INSPECTOR
    for (const appt of appointments) {
      if (appt.status !== 'AWAITING_INSPECTOR') {
        throw new AppointmentInvalidStatusError(appt.appointmentNumber);
      }
    }

    const now = new Date();
    const newOfferedCount = group.offeredCount + 1;

    await this.serviceGroupRepo.update(groupId, {
      status: 'PUBLISHED',
      offeredCount: newOfferedCount,
      publishedAt: now,
    });

    this.auditService.log({
      action: 'service_group.published',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: primaryTenantId,
      before: { status: 'DRAFT', offeredCount: group.offeredCount },
      after: { status: 'PUBLISHED', offeredCount: newOfferedCount },
    });

    this.eventBus?.emit({
      type: SERVICE_GROUP_EVENTS.PUBLISHED,
      payload: { groupId, tenantId: primaryTenantId },
      occurredAt: new Date(),
    });

    // Reflect the updates on the in-memory entity for the response
    group.status = 'PUBLISHED';
    group.offeredCount = newOfferedCount;
    group.publishedAt = now;

    return mapGroupToOutput(group, primaryTenantId);
  }
}

function mapGroupToOutput(group: ServiceGroupEntity, primaryTenantId: string | null): PublishServiceGroupOutput {
  return {
    id: group.id,
    tenantId: primaryTenantId,
    serviceTypeId: group.serviceTypeId,
    status: group.status,
    groupSize: group.groupSize,
    offeredCount: group.offeredCount,
    confirmedCount: group.confirmedCount,
    scheduledDate: group.scheduledDate,
    timeWindow: group.timeWindow,
    regionName: group.regionName,
    description: group.description,
    assignedInspectorId: group.assignedInspectorId,
    serviceRegionId: group.serviceRegionId,
    publishedAt: group.publishedAt,
    assignedAt: group.assignedAt,
    createdByUserId: group.createdByUserId,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}
