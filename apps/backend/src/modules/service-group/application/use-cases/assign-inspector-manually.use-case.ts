import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  InspectorInactiveError,
  InspectorServiceTypeIneligibleError,
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
