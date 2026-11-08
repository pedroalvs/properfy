import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IAvailabilitySlotRepository } from '../../../inspector/domain/availability-slot.repository';
import type { IOfferEarlyAccessPolicy } from '../../domain/offer-early-access.policy';
import { isGroupInEarlyAccess, offerOpensAt } from '../../domain/early-access';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  GroupAlreadyAcceptedError,
  InspectorIneligibleError,
  InspectorRegionIneligibleError,
  InspectorServiceTypeIneligibleError,
  InspectorInactiveError,
  AppointmentsNotAwaitingInspectorError,
  OfferEarlyAccessOnlyError,
} from '../../domain/service-group.errors';

/** Minimal logger port for the denied-accept info log (no PII). */
interface AcceptOfferLogger {
  info(obj: Record<string, unknown>, msg: string): void;
}

export interface AcceptOfferInput {
  groupId: string;
  inspectorId: string;
  actor: AuthContext;
  idempotencyKey?: string;
}

export interface AcceptOfferOutput {
  groupId: string;
  status: string;
  assignedInspectorId: string;
  appointmentsScheduled: number;
  acceptedAt: Date;
}

export class AcceptOfferUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
    private readonly availabilitySlotRepo?: IAvailabilitySlotRepository,
    private readonly earlyAccessPolicy?: IOfferEarlyAccessPolicy,
    private readonly logger?: AcceptOfferLogger,
  ) {}

  async execute(input: AcceptOfferInput): Promise<AcceptOfferOutput> {
    const { actor, groupId, inspectorId } = input;

    const idempotencyKey = input.idempotencyKey ?? `accept-offer:${groupId}:${inspectorId}`;
    const cached = await this.idempotencyService.get<AcceptOfferOutput>(idempotencyKey, 'accept-offer');
    if (cached) {
      if (cached.assignedInspectorId !== actor.inspectorId) {
        throw new ForbiddenError(
          'ACCEPT_OFFER_IDENTITY_MISMATCH',
          'Idempotency key was used by a different inspector',
        );
      }
      return cached;
    }

    this.authorizationService.assertRoles(actor, ['INSP'], { action: 'marketplace.accept_offer', entityType: 'ServiceGroup' });

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) {
      throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');
    }

    if (!inspector.isActive()) {
      throw new InspectorInactiveError();
    }

    const findResult = await this.serviceGroupRepo.findById(groupId, null);
    if (!findResult) {
      throw new ServiceGroupNotFoundError();
    }
    const { group, tenantIds, primaryTenantId } = findResult;

    if (!group.canAccept()) {
      if (group.status === 'ACCEPTED') {
        throw new GroupAlreadyAcceptedError();
      }
      throw new ServiceGroupInvalidStatusError('PUBLISHED', group.status);
    }

    if (!inspector.supportsServiceType(group.serviceTypeId)) {
      throw new InspectorServiceTypeIneligibleError();
    }

    // Eligible only when the inspector can serve EVERY agency in the group.
    // An empty tenant set (no live appointments) must NOT pass — `[].every()`
    // is true, which would otherwise grant access to an empty group.
    if (tenantIds.length === 0 || !tenantIds.every((t) => inspector.isEligibleForTenant(t))) {
      throw new InspectorIneligibleError();
    }

    // The checks above give specific errors for service type and denylist; this
    // one applies the full marketplace predicate the offer list uses, so a group
    // the inspector cannot see (outside their regions) cannot be accepted either.
    const eligible = await this.serviceGroupRepo.isGroupEligibleForInspector(
      groupId,
      inspectorId,
      inspector.serviceTypesJson.map((s) => s.serviceTypeId),
      inspector.blockedClientsJson,
    );
    if (!eligible) {
      throw new InspectorRegionIneligibleError();
    }

    // Early-access gate (F08-2, 03.7): after the eligibility checks and before the
    // optimistic accept. When the offer is still in its window and the inspector is
    // below the required level, refuse with the "opens at" time — acceptOptimistic
    // is never reached.
    const earlyAccess = await this.earlyAccessPolicy?.resolve(inspectorId, new Date());
    if (earlyAccess) {
      const state = await this.serviceGroupRepo.findEarlyAccessStateForGroup(groupId, earlyAccess);
      if (state && state.publishedAt && isGroupInEarlyAccess(state, earlyAccess)) {
        const opensAt = offerOpensAt(state.publishedAt, earlyAccess);
        this.logger?.info(
          { groupId, inspectorId, opensAt: opensAt.toISOString() },
          'marketplace.early_access_denied',
        );
        throw new OfferEarlyAccessOnlyError(opensAt);
      }
    }

    const now = new Date();
    const updatedCount = await this.serviceGroupRepo.acceptOptimistic(groupId, inspectorId, now);
    if (updatedCount === 0) {
      throw new GroupAlreadyAcceptedError();
    }

    // Saga compensation: any failure in the post-accept steps must roll back
    // the group and appointment side-effects so the system isn't left in a
    // half-accepted state. Best-effort — compensation errors are audited but
    // do not mask the original error.
    let appointmentsScheduled = false;
    let scheduledCount = 0;

    try {
      // Re-verify all linked appointments are still AWAITING_INSPECTOR after optimistic lock
      const freshResult = await this.serviceGroupRepo.findById(groupId, null);
      if (freshResult) {
        const invalidAppointments = freshResult.appointments
          .filter((appt) => appt.status !== 'AWAITING_INSPECTOR')
          .map((appt) => ({ appointmentNumber: appt.appointmentNumber, status: appt.status }));

        if (invalidAppointments.length > 0) {
          throw new AppointmentsNotAwaitingInspectorError(invalidAppointments);
        }
      }

      scheduledCount = await this.serviceGroupRepo.scheduleAppointments(groupId, inspectorId);
      appointmentsScheduled = true;

      await this.serviceGroupRepo.update(groupId, {
        confirmedCount: scheduledCount,
      });
    } catch (err) {
      // Compensate in reverse order. Each step is independent and best-effort.
      try {
        if (appointmentsScheduled) {
          await this.serviceGroupRepo.revertScheduledAppointments(groupId);
        }
        await this.serviceGroupRepo.update(groupId, {
          status: 'PUBLISHED',
          assignedInspectorId: null,
          assignedAt: null,
          confirmedCount: 0,
        });
      } catch (compensationErr) {
        this.auditService.log({
          action: 'service_group.accept_compensation_failed',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'ServiceGroup',
          entityId: groupId,
          tenantId: primaryTenantId,
          metadata: {
            originalError: err instanceof Error ? err.message : String(err),
            compensationError: compensationErr instanceof Error ? compensationErr.message : String(compensationErr),
          },
        });
      }
      throw err;
    }

    this.auditService.log({
      action: 'service_group.accepted',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: primaryTenantId,
      before: { status: 'PUBLISHED' },
      after: {
        status: 'ACCEPTED',
        assignedInspectorId: inspectorId,
        appointmentsScheduled: scheduledCount,
      },
    });

    const result: AcceptOfferOutput = {
      groupId,
      status: 'ACCEPTED',
      assignedInspectorId: inspectorId,
      appointmentsScheduled: scheduledCount,
      acceptedAt: now,
    };

    await this.idempotencyService.set(idempotencyKey, 'accept-offer', result, 24);

    this.eventBus?.emit({
      type: SERVICE_GROUP_EVENTS.ACCEPTED,
      payload: { groupId, tenantId: primaryTenantId, inspectorId },
      occurredAt: new Date(),
    });

    return result;
  }
}
