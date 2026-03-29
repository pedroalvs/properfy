import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
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
  ) {}

  async execute(input: AssignInspectorManuallyInput): Promise<AssignInspectorManuallyOutput> {
    const { actor, groupId, inspectorId } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }
    const { group } = result;

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
    const propertyIds = result.appointments.map((a) => a.propertyId);
    if (propertyIds.length > 0) {
      const coveredPropertyIds = await this.serviceRegionRepo.findPropertyIdsInInspectorRegions(inspectorId);
      const coveredSet = new Set(coveredPropertyIds);
      const uncoveredProperties = propertyIds.filter((pid) => !coveredSet.has(pid));
      if (uncoveredProperties.length > 0) {
        throw new InspectorIneligibleError();
      }
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
      },
      reason: `Manual assignment by ${actor.role}`,
    });

    return {
      id: groupId,
      status: 'ACCEPTED',
      assignedInspectorId: inspectorId,
      appointmentsScheduled: scheduledCount,
    };
  }
}
