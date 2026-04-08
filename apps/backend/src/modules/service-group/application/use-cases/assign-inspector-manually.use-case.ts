import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { IAvailabilitySlotRepository } from '../../../inspector/domain/availability-slot.repository';
import {
  AvailabilitySlotCapacityExhaustedError,
  AvailabilitySlotNotMatchedError,
} from '../../../inspector/domain/inspector.errors';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  InspectorInactiveError,
  InspectorIneligibleError,
  InspectorServiceTypeIneligibleError,
  AssignedInspectorConflictError,
} from '../../domain/service-group.errors';

export interface AssignInspectorManuallyInput {
  groupId: string;
  inspectorId: string;
  actor: AuthContext;
  idempotencyKey?: string;
}

export interface AssignInspectorManuallyOutput {
  id: string;
  status: string;
  assignedInspectorId: string;
  appointmentsScheduled: number;
}

export class AssignInspectorManuallyUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
    private readonly serviceRegionRepo: IServiceRegionRepository,
    private readonly idempotencyService: IIdempotencyService,
    private readonly eventBus?: DomainEventBus,
    private readonly availabilitySlotRepo?: IAvailabilitySlotRepository,
  ) {}

  async execute(input: AssignInspectorManuallyInput): Promise<AssignInspectorManuallyOutput> {
    const { actor, groupId, inspectorId } = input;

    const idempotencyKey = input.idempotencyKey ?? `assign-inspector:${groupId}:${inspectorId}`;
    const cached = await this.idempotencyService.get<AssignInspectorManuallyOutput>(idempotencyKey, 'assign-inspector');
    if (cached) {
      return cached;
    }

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const findResult = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!findResult) {
      throw new ServiceGroupNotFoundError();
    }
    const { group } = findResult;

    // Idempotency: if already ACCEPTED with the same inspector, return current state
    if (group.status === 'ACCEPTED' && group.assignedInspectorId === inspectorId) {
      return {
        id: groupId,
        status: 'ACCEPTED',
        assignedInspectorId: inspectorId,
        appointmentsScheduled: group.confirmedCount,
      };
    }

    // Conflict: already ACCEPTED with a different inspector
    if (group.status === 'ACCEPTED' && group.assignedInspectorId !== inspectorId) {
      throw new AssignedInspectorConflictError(group.assignedInspectorId!);
    }

    if (!group.canAssign()) {
      throw new ServiceGroupInvalidStatusError('DRAFT or PUBLISHED', group.status);
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) {
      throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');
    }

    if (!inspector.isActive()) {
      throw new InspectorInactiveError();
    }

    if (!inspector.supportsServiceType(group.serviceTypeId)) {
      throw new InspectorServiceTypeIneligibleError();
    }

    if (!inspector.isEligibleForTenant(group.tenantId)) {
      throw new InspectorIneligibleError();
    }

    // Validate inspector's regions cover the service group's properties
    const propertyIds = findResult.appointments.map((a) => a.propertyId);
    if (propertyIds.length > 0) {
      const coveredPropertyIds = await this.serviceRegionRepo.findPropertyIdsInInspectorRegions(inspectorId);
      const coveredSet = new Set(coveredPropertyIds);
      const uncoveredProperties = propertyIds.filter((pid) => !coveredSet.has(pid));
      if (uncoveredProperties.length > 0) {
        throw new InspectorIneligibleError();
      }
    }

    // Book availability slot: find matching slot and decrement capacity
    let bookedSlotId: string | null = null;
    if (this.availabilitySlotRepo) {
      const parts = group.timeWindow.split('-');
      const slotStart = parts[0] ?? '';
      const slotEnd = parts[1] ?? '';
      const slot = await this.availabilitySlotRepo.findMatchingSlot(
        inspectorId,
        group.scheduledDate,
        slotStart,
        slotEnd,
      );
      if (!slot) {
        throw new AvailabilitySlotNotMatchedError();
      }
      const updatedCapacity = await this.availabilitySlotRepo.decrementCapacity(slot.id);
      if (updatedCapacity === null) {
        throw new AvailabilitySlotCapacityExhaustedError();
      }
      bookedSlotId = slot.id;
    }

    const now = new Date();

    await this.serviceGroupRepo.update(groupId, {
      status: 'ACCEPTED',
      assignedInspectorId: inspectorId,
      assignedAt: now,
    });

    const scheduledCount = await this.serviceGroupRepo.scheduleAppointments(groupId, inspectorId);

    await this.serviceGroupRepo.update(groupId, {
      confirmedCount: scheduledCount,
    });

    this.auditService.log({
      action: 'service_group.manually_assigned',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: group.tenantId,
      before: { status: group.status },
      after: {
        status: 'ACCEPTED',
        assignedInspectorId: inspectorId,
        appointmentsScheduled: scheduledCount,
        ...(bookedSlotId ? { bookedSlotId } : {}),
      },
      reason: `Manual assignment by ${actor.role}`,
    });

    const result: AssignInspectorManuallyOutput = {
      id: groupId,
      status: 'ACCEPTED',
      assignedInspectorId: inspectorId,
      appointmentsScheduled: scheduledCount,
    };

    await this.idempotencyService.set(idempotencyKey, 'assign-inspector', result, 24);

    this.eventBus?.emit({
      type: SERVICE_GROUP_EVENTS.MANUALLY_ASSIGNED,
      payload: { groupId, tenantId: group.tenantId, inspectorId },
      occurredAt: new Date(),
    });

    return result;
  }
}
