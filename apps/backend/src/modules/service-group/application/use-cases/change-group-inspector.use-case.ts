import type { AuthContext } from '@properfy/shared';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
} from '../../domain/service-group.errors';
import { assertInspectorEligibleForGroup } from '../assert-inspector-eligible-for-group';

/** A group can change hands while it is still live; a closed one has nothing to hand over. */
const CHANGEABLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ACCEPTED'];

export interface ChangeGroupInspectorInput {
  groupId: string;
  inspectorId: string;
  /** Required: this revokes a commitment the outgoing inspector already made. */
  reason: string;
  actor: AuthContext;
  idempotencyKey?: string;
}

export interface ChangeGroupInspectorOutput {
  id: string;
  status: string;
  assignedInspectorId: string;
  previousInspectorId: string | null;
  appointmentsReassigned: number;
  appointmentsScheduled: number;
}

/**
 * Assigns or replaces the inspector on a live group.
 *
 * `AssignInspectorManuallyUseCase` deliberately refuses an ACCEPTED group that
 * already has a different inspector — that 409 is the marketplace race guard and
 * must stay. This use case is the operator's explicit override for the case that
 * guard cannot serve: the assigned inspector dropped out and the work has to move.
 *
 * Members change hands in bulk rather than through
 * `ExecuteStatusTransitionUseCase`, because reassigning an accepted group is
 * SCHEDULED -> SCHEDULED, which the appointment state machine rejects. The
 * notifications that a status transition would have sent are re-driven from the
 * emitted events, the same arrangement `NotifyOnGroupAcceptedSubscriber` already
 * uses for the bulk accept path.
 */
export class ChangeGroupInspectorUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly serviceRegionRepo: IServiceRegionRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: ChangeGroupInspectorInput): Promise<ChangeGroupInspectorOutput> {
    const { actor, groupId, inspectorId, reason } = input;

    // Only an explicit caller-supplied key replays. Synthesizing one from
    // (groupId, inspectorId) — as manual assignment does — would make the
    // sequence A -> B -> A a silent no-op that leaves B assigned.
    if (input.idempotencyKey) {
      const cached = await this.idempotencyService.get<ChangeGroupInspectorOutput>(
        input.idempotencyKey,
        'reassign-inspector',
      );
      if (cached) return cached;
    }

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'service_group.manage',
      entityType: 'ServiceGroup',
    });

    const findResult = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!findResult) {
      throw new ServiceGroupNotFoundError();
    }
    const { group, tenantIds, primaryTenantId } = findResult;

    if (!CHANGEABLE_STATUSES.includes(group.status)) {
      throw new ServiceGroupInvalidStatusError('DRAFT, PUBLISHED or ACCEPTED', group.status);
    }

    const previousInspectorId = group.assignedInspectorId;

    // Already theirs: return current state without writing, auditing or
    // notifying, so a double-submit cannot spam the inspector.
    if (group.status === 'ACCEPTED' && previousInspectorId === inspectorId) {
      return {
        id: groupId,
        status: group.status,
        assignedInspectorId: inspectorId,
        previousInspectorId,
        appointmentsReassigned: group.confirmedCount,
        appointmentsScheduled: 0,
      };
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) {
      throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');
    }

    await assertInspectorEligibleForGroup({
      inspector,
      serviceTypeId: group.serviceTypeId,
      tenantIds,
      propertyIds: findResult.appointments.map((a) => a.propertyId),
      serviceRegionRepo: this.serviceRegionRepo,
    });

    await this.serviceGroupRepo.update(groupId, {
      status: 'ACCEPTED',
      assignedInspectorId: inspectorId,
      assignedAt: new Date(),
    });

    const { reassigned, scheduled } = await this.serviceGroupRepo.assignInspectorToGroupAppointments(
      groupId,
      inspectorId,
    );

    await this.serviceGroupRepo.update(groupId, { confirmedCount: reassigned + scheduled });

    this.auditService.log({
      action: 'service_group.inspector_changed',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: primaryTenantId,
      before: { status: group.status, assignedInspectorId: previousInspectorId },
      after: { status: 'ACCEPTED', assignedInspectorId: inspectorId },
      reason,
      metadata: {
        previousInspectorId,
        initiatedBy: actor.role,
        groupStatus: group.status,
        appointmentsReassigned: reassigned,
        appointmentsScheduled: scheduled,
      },
    });

    const result: ChangeGroupInspectorOutput = {
      id: groupId,
      status: 'ACCEPTED',
      assignedInspectorId: inspectorId,
      previousInspectorId,
      appointmentsReassigned: reassigned,
      appointmentsScheduled: scheduled,
    };

    if (input.idempotencyKey) {
      await this.idempotencyService.set(input.idempotencyKey, 'reassign-inspector', result, 24);
    }

    const occurredAt = new Date();
    this.eventBus?.emit({
      type: SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED,
      payload: { groupId, tenantId: primaryTenantId, inspectorId, previousInspectorId },
      occurredAt,
    });

    // First assignment also crosses AWAITING_INSPECTOR -> SCHEDULED for the
    // members, so the rental tenants still owe their INSPECTION_NOTICE. A
    // group that was already ACCEPTED has sent those, and the schedule has not
    // moved, so re-emitting would only duplicate them.
    if (group.status !== 'ACCEPTED') {
      this.eventBus?.emit({
        type: SERVICE_GROUP_EVENTS.MANUALLY_ASSIGNED,
        payload: { groupId, tenantId: primaryTenantId, inspectorId },
        occurredAt,
      });
    }

    return result;
  }
}
