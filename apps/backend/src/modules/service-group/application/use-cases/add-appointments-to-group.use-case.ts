import type { AuthContext } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { NotFoundError } from '../../../../shared/domain/errors';
import { ServiceGroupValidator, ADDABLE_GROUP_STATUSES, type AddToGroupReason } from '../../domain/service-group.validator';
import { trySyncAppointmentScheduleToGroup, type ServiceGroupTimeSyncLogger } from '../sync-appointment-time-slot-to-group';
import { type DomainEventBus, SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';

export type AddToGroupResultStatus = 'OK' | AddToGroupReason | 'NOT_FOUND' | 'ERROR';

export interface AddToGroupResultItem {
  appointmentId: string;
  status: AddToGroupResultStatus;
  error?: { code: string; message: string };
}

export interface AddAppointmentsToGroupInput {
  groupId: string;
  appointmentIds: string[];
  actor: AuthContext;
}

export interface AddAppointmentsToGroupOutput {
  results: AddToGroupResultItem[];
}

/**
 * 026 §FR-510 — Add appointments to an existing service group.
 *
 * Thin loop over the canonical `ServiceGroupValidator.canAddToGroup`
 * predicate. Per-item failures land in the result envelope so the
 * route can surface them without aborting the batch. DRAFT items are
 * auto-transitioned to AWAITING_INSPECTOR via the
 * `ExecuteStatusTransitionUseCase` — matching the side-effect that the
 * single-group-create flow performs (`create-service-group.use-case.ts`).
 *
 * Why per-item linking instead of batch `repo.linkAppointments`?
 * Validation runs against the LIVE group state (capacity counts up as
 * we link), so each item must check + link sequentially. The cap is
 * 30 per the schema, so the loop is bounded.
 *
 * Adding to an ACCEPTED group: the group is already committed to an
 * inspector, so a new member does not go back onto the marketplace —
 * it is scheduled directly under that inspector (status SCHEDULED,
 * `inspector_id` set, `confirmed_count` incremented). A single
 * `MEMBERS_ADDED` event is emitted after the batch so the rental tenants
 * of the *newly added* appointments get their notice and the inspector is
 * told their schedule grew, without re-notifying the group's existing
 * members (which is why ACCEPTED/MANUALLY_ASSIGNED are not re-emitted here).
 */
export class AddAppointmentsToGroupUseCase {
  constructor(
    private readonly groupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus: DomainEventBus,
    private readonly logger: ServiceGroupTimeSyncLogger = { error: () => undefined },
  ) {}

  async execute(input: AddAppointmentsToGroupInput): Promise<AddAppointmentsToGroupOutput> {
    // RBAC at the use-case layer (defence in depth — route also enforces).
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'appointment.add_to_group',
      entityType: 'ServiceGroup',
      entityId: input.groupId,
    });

    // AM has cross-tenant access; OP is tenant-scoped per the same rule
    // every other appointment-write use case applies.
    const groupTenantScope = input.actor.role === 'AM' ? null : input.actor.tenantId;
    const found = await this.groupRepo.findById(input.groupId, groupTenantScope);
    if (!found) {
      throw new NotFoundError('SERVICE_GROUP_NOT_FOUND', `Service group ${input.groupId} not found`);
    }
    const { group } = found;
    let currentSize = found.appointments.length;

    const results: AddToGroupResultItem[] = [];
    // Appointments scheduled under the group's committed inspector (ACCEPTED path).
    // Drives the single post-batch MEMBERS_ADDED event.
    const scheduledUnderInspector: string[] = [];

    for (const apptId of input.appointmentIds) {
      // Always look up cross-tenant first; the validator's INVALID_TENANT
      // check is what surfaces a tenant mismatch as a typed reason rather
      // than a 404. This avoids leaking the existence of an appointment
      // via 404 timing — same pattern as 024 BUG-024-002.
      const foundAppt = await this.appointmentRepo.findById(apptId, null);
      if (!foundAppt) {
        results.push({ appointmentId: apptId, status: 'NOT_FOUND', error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' } });
        continue;
      }
      const { appointment } = foundAppt;
      const validation = ServiceGroupValidator.canAddToGroup(
        {
          id: appointment.id,
          appointmentNumber: appointment.appointmentNumber,
          status: appointment.status,
          serviceTypeId: appointment.serviceTypeId,
          tenantId: appointment.tenantId,
          serviceGroupId: appointment.serviceGroupId,
        },
        {
          status: group.status,
          serviceTypeId: group.serviceTypeId,
          currentSize,
        },
        // The appointment's *existing* link, if any. A link to a terminal group is
        // the dead weight the empty-group cleanup leaves behind rather than real
        // ownership, so the validator lets it be replaced — otherwise the
        // appointment can never be re-grouped and stays stranded.
        appointment.serviceGroupId
          ? await this.groupRepo.findStatusById(appointment.serviceGroupId)
          : undefined,
      );
      if (!validation.ok) {
        results.push({
          appointmentId: apptId,
          status: validation.reasonCode,
          error: { code: validation.reasonCode, message: reasonMessage(validation.reasonCode) },
        });
        continue;
      }

      try {
        // `validation` above judged the group from a snapshot read before the loop.
        // The link itself re-checks the group's status atomically, so a group
        // cancelled in between (e.g. by the empty-group cleanup, once this
        // appointment's predecessor was cancelled) reports 0 rows instead of
        // stranding a live appointment on a group nobody will ever offer.
        const linked = await this.groupRepo.linkAppointments([apptId], input.groupId);
        if (linked === 0) {
          // Two preconditions live in that statement, so distinguish which one
          // rejected rather than blaming the group for a lost race over the
          // appointment. Only runs on this rare failure path.
          const freshGroupStatus = await this.groupRepo.findStatusById(input.groupId);
          const reason =
            freshGroupStatus === null || !ADDABLE_GROUP_STATUSES.has(freshGroupStatus as never)
              ? 'GROUP_IN_TERMINAL_STATE'
              : 'ALREADY_GROUPED';
          results.push({
            appointmentId: apptId,
            status: reason,
            error: { code: reason, message: reasonMessage(reason) },
          });
          continue;
        }
        currentSize += 1;

        await trySyncAppointmentScheduleToGroup({
          appointmentRepo: this.appointmentRepo,
          auditService: this.auditService,
          appointment,
          groupTimeWindow: group.timeWindow,
          groupScheduledDate: group.scheduledDate,
          groupId: input.groupId,
          actor: input.actor,
          logger: this.logger,
        });

        if (group.status === 'ACCEPTED' && group.assignedInspectorId) {
          // The group is already committed to an inspector, so the new member joins
          // as SCHEDULED under that inspector rather than going back onto the
          // marketplace as AWAITING_INSPECTOR. Bulk update bypasses the state machine
          // the same way AcceptOffer/AssignInspectorManually do (DRAFT→SCHEDULED is not
          // a legal ExecuteStatusTransition edge), and the move is audited as SYSTEM.
          const inspectorId = group.assignedInspectorId;
          await this.appointmentRepo.update(apptId, appointment.tenantId, {
            status: 'SCHEDULED',
            inspectorId,
          });
          await this.groupRepo.incrementConfirmedCount(input.groupId);
          this.auditService.log({
            action: 'appointment.status_transition',
            actorType: 'SYSTEM',
            actorId: input.actor.userId,
            entityType: 'Appointment',
            entityId: apptId,
            tenantId: appointment.tenantId,
            before: { status: appointment.status },
            after: { status: 'SCHEDULED' },
            reason: `Added to accepted service group ${input.groupId}`,
            metadata: {
              systemTriggered: true,
              groupId: input.groupId,
              previousStatus: appointment.status,
              assignedInspectorId: inspectorId,
            },
          });
          scheduledUnderInspector.push(apptId);
        } else if (appointment.status === 'DRAFT') {
          // DRAFT→AWAITING_INSPECTOR rule = OP+SYS; system-triggered by group add.
          await this.appointmentRepo.update(apptId, appointment.tenantId, { status: 'AWAITING_INSPECTOR' });
          this.auditService.log({
            action: 'appointment.status_transition',
            actorType: 'SYSTEM',
            actorId: input.actor.userId,
            entityType: 'Appointment',
            entityId: apptId,
            tenantId: appointment.tenantId,
            before: { status: 'DRAFT' },
            after: { status: 'AWAITING_INSPECTOR' },
            reason: `Added to service group ${input.groupId}`,
            metadata: { systemTriggered: true, groupId: input.groupId, previousStatus: 'DRAFT' },
          });
        } else if (appointment.status === 'REJECTED') {
          // REJECTED→AWAITING_INSPECTOR rule = OP+AM; actor is real (not system).
          await this.appointmentRepo.update(apptId, appointment.tenantId, { status: 'AWAITING_INSPECTOR' });
          this.auditService.log({
            action: 'appointment.status_transition',
            actorType: 'USER',
            actorId: input.actor.userId,
            entityType: 'Appointment',
            entityId: apptId,
            tenantId: appointment.tenantId,
            before: { status: 'REJECTED' },
            after: { status: 'AWAITING_INSPECTOR' },
            reason: `Added to service group ${input.groupId}`,
            metadata: { systemTriggered: false, groupId: input.groupId, previousStatus: 'REJECTED' },
          });
        }

        this.auditService.log({
          action: 'appointment.added_to_group',
          actorType: 'USER',
          actorId: input.actor.userId,
          entityType: 'Appointment',
          entityId: apptId,
          tenantId: appointment.tenantId,
          metadata: { groupId: input.groupId, previousStatus: appointment.status },
        });
        results.push({ appointmentId: apptId, status: 'OK' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR';
        results.push({
          appointmentId: apptId,
          status: 'ERROR',
          error: { code, message },
        });
      }
    }

    // One event per batch: the tenant subscriber notifies only the newly added
    // appointments (not the whole group) and the inspector subscriber tells the
    // committed inspector their schedule grew. Emitted after all writes so the
    // subscribers re-query committed state.
    if (scheduledUnderInspector.length > 0 && group.assignedInspectorId) {
      await this.eventBus.emit({
        type: SERVICE_GROUP_EVENTS.MEMBERS_ADDED,
        payload: {
          groupId: input.groupId,
          inspectorId: group.assignedInspectorId,
          appointmentIds: scheduledUnderInspector,
        },
        occurredAt: new Date(),
      });
    }

    return { results };
  }
}

function reasonMessage(code: AddToGroupReason): string {
  switch (code) {
    case 'INVALID_STATUS': return 'Appointment must be in DRAFT or AWAITING_INSPECTOR status';
    case 'ALREADY_GROUPED': return 'Appointment is already linked to another service group';
    case 'INVALID_SERVICE_TYPE': return 'Appointment service type does not match the group';
    case 'GROUP_IN_TERMINAL_STATE': return 'Group is in a terminal state and cannot accept new appointments';
    case 'GROUP_CAPACITY_EXCEEDED': return 'Group has reached its capacity of 30 appointments';
  }
}
