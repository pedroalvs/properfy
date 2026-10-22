import type { AuthContext } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { InspectorEntity } from '../../../inspector/domain/inspector.entity';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { NotFoundError } from '../../../../shared/domain/errors';
import { ServiceGroupValidator, LINKABLE_GROUP_STATUSES, type AddToGroupReason } from '../../domain/service-group.validator';
import { assertInspectorEligibleForGroup } from '../assert-inspector-eligible-for-group';
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
    private readonly inspectorRepo: IInspectorRepository,
    private readonly serviceRegionRepo: IServiceRegionRepository,
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

    // For an ACCEPTED group, members are scheduled under the committed inspector, so
    // we need that inspector's entity to run the same eligibility gate accept/assign
    // apply. Loaded once (the group has at most one). A null here (data integrity /
    // concurrent reassignment to null) makes every ACCEPTED add fail eligibility
    // rather than silently scheduling under a missing inspector.
    const acceptedInspector: InspectorEntity | null =
      group.status === 'ACCEPTED' && group.assignedInspectorId
        ? await this.inspectorRepo.findById(group.assignedInspectorId)
        : null;

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
        if (group.status === 'ACCEPTED' && group.assignedInspectorId) {
          // ── ACCEPTED group ──────────────────────────────────────────────────
          // The group is already committed to an inspector, so the new member is
          // scheduled under that inspector rather than put back on the marketplace.
          // 1) Gate on the SAME eligibility accept/assign enforce — never assign the
          //    inspector a job in an agency/region/service type they do not serve.
          const eligible = await this.isInspectorEligible(acceptedInspector, group.serviceTypeId, appointment);
          if (!eligible) {
            results.push({
              appointmentId: apptId,
              status: 'INSPECTOR_INELIGIBLE',
              error: { code: 'INSPECTOR_INELIGIBLE', message: reasonMessage('INSPECTOR_INELIGIBLE') },
            });
            continue;
          }
          // 2) Link + schedule + increment atomically under a group row lock, guarded
          //    on the group still being ACCEPTED with this exact inspector. Closes the
          //    snapshot race and never leaves a linked-but-unscheduled member.
          const outcome = await this.groupRepo.commitAppointmentToAcceptedGroup({
            appointmentId: apptId,
            groupId: input.groupId,
            expectedInspectorId: group.assignedInspectorId,
          });
          if (outcome === 'GROUP_CHANGED') {
            // Concurrent reject/reassign dropped the ACCEPTED-under-this-inspector
            // precondition mid-batch. Retryable conflict, not a terminal state.
            results.push({
              appointmentId: apptId,
              status: 'ERROR',
              error: { code: 'GROUP_STATE_CHANGED', message: 'Group changed before the appointment could be added; please retry' },
            });
            continue;
          }
          if (outcome === 'APPOINTMENT_CONFLICT') {
            // The appointment left a schedulable state (cancelled / rejected / DONE /
            // soft-deleted / grabbed by another group) between the snapshot and the
            // commit. Retryable; nothing was written.
            results.push({
              appointmentId: apptId,
              status: 'ERROR',
              error: { code: 'APPOINTMENT_STATE_CHANGED', message: 'Appointment changed before it could be added; please retry' },
            });
            continue;
          }
          currentSize += 1;

          // Align the member's date/time with the group (best-effort; status is
          // already SCHEDULED, so a sync failure only leaves date/time unaligned).
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

          // The atomic write collapses two legal transitions into one UPDATE; audit
          // them as the two hops the state machine actually defines, with the correct
          // actor class, rather than a single illegal DRAFT/REJECTED → SCHEDULED edge.
          this.auditAcceptedGroupSchedule(apptId, appointment.status, appointment.tenantId, group.assignedInspectorId, input);
          scheduledUnderInspector.push(apptId);
        } else {
          // ── DRAFT / PUBLISHED group ─────────────────────────────────────────
          // Plain link (re-checked atomically against LINKABLE_GROUP_STATUSES), then
          // revive to AWAITING_INSPECTOR. If the group was accepted or cancelled
          // mid-batch the link reports 0 rows instead of stranding the appointment.
          const linked = await this.groupRepo.linkAppointments([apptId], input.groupId);
          if (linked === 0) {
            const freshGroupStatus = await this.groupRepo.findStatusById(input.groupId);
            if (freshGroupStatus === 'ACCEPTED') {
              // The group was accepted between the snapshot and the link; it now takes
              // members via the scheduling commit. Retryable conflict.
              results.push({
                appointmentId: apptId,
                status: 'ERROR',
                error: { code: 'GROUP_STATE_CHANGED', message: 'Group changed before the appointment could be added; please retry' },
              });
              continue;
            }
            // Otherwise distinguish a dead/absent group from a lost race over the
            // appointment (it was linked elsewhere first).
            const reason =
              freshGroupStatus === null || !LINKABLE_GROUP_STATUSES.has(freshGroupStatus as never)
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

          if (appointment.status === 'DRAFT') {
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

  /**
   * Audit the ACCEPTED-group scheduling as the legal two-hop path the atomic write
   * collapses: the group-join revival (DRAFT/REJECTED → AWAITING_INSPECTOR) and the
   * acceptance (AWAITING_INSPECTOR → SCHEDULED). There is no legal direct edge from
   * DRAFT/REJECTED to SCHEDULED, and the revival hop from REJECTED is an OP/AM (USER)
   * action, not SYSTEM — recording a single DRAFT→SCHEDULED/SYSTEM entry would put an
   * illegal transition with the wrong actor class in the audit trail.
   */
  private auditAcceptedGroupSchedule(
    appointmentId: string,
    previousStatus: string,
    tenantId: string,
    inspectorId: string,
    input: AddAppointmentsToGroupInput,
  ): void {
    const base = {
      action: 'appointment.status_transition' as const,
      actorId: input.actor.userId,
      entityType: 'Appointment' as const,
      entityId: appointmentId,
      tenantId,
      reason: `Added to accepted service group ${input.groupId}`,
    };
    // Hop 1 — revival to AWAITING_INSPECTOR (only DRAFT/REJECTED need it).
    if (previousStatus === 'DRAFT') {
      this.auditService.log({
        ...base,
        actorType: 'SYSTEM',
        before: { status: 'DRAFT' },
        after: { status: 'AWAITING_INSPECTOR' },
        metadata: { systemTriggered: true, groupId: input.groupId, previousStatus: 'DRAFT' },
      });
    } else if (previousStatus === 'REJECTED') {
      this.auditService.log({
        ...base,
        actorType: 'USER',
        before: { status: 'REJECTED' },
        after: { status: 'AWAITING_INSPECTOR' },
        metadata: { systemTriggered: false, groupId: input.groupId, previousStatus: 'REJECTED' },
      });
    }
    // Hop 2 — acceptance under the group's committed inspector.
    this.auditService.log({
      ...base,
      actorType: 'SYSTEM',
      before: { status: 'AWAITING_INSPECTOR' },
      after: { status: 'SCHEDULED' },
      metadata: {
        systemTriggered: true,
        groupId: input.groupId,
        previousStatus: 'AWAITING_INSPECTOR',
        assignedInspectorId: inspectorId,
      },
    });
  }

  /**
   * Whether the ACCEPTED group's committed inspector may take this appointment —
   * the same gate accept/assign apply (active, service type, every agency, region
   * coverage). Returns false (rather than throwing) so a per-item rejection lands in
   * the result envelope instead of aborting the batch. A null inspector (missing /
   * concurrently unassigned) is treated as ineligible.
   */
  private async isInspectorEligible(
    inspector: InspectorEntity | null,
    serviceTypeId: string,
    appointment: { tenantId: string; propertyId: string },
  ): Promise<boolean> {
    if (!inspector) return false;
    try {
      await assertInspectorEligibleForGroup({
        inspector,
        serviceTypeId,
        tenantIds: [appointment.tenantId],
        propertyIds: [appointment.propertyId],
        serviceRegionRepo: this.serviceRegionRepo,
      });
      return true;
    } catch {
      return false;
    }
  }
}

function reasonMessage(code: AddToGroupReason): string {
  switch (code) {
    case 'INVALID_STATUS': return 'Appointment must be in DRAFT or AWAITING_INSPECTOR status';
    case 'ALREADY_GROUPED': return 'Appointment is already linked to another service group';
    case 'INVALID_SERVICE_TYPE': return 'Appointment service type does not match the group';
    case 'GROUP_IN_TERMINAL_STATE': return 'Group is in a terminal state and cannot accept new appointments';
    case 'GROUP_CAPACITY_EXCEEDED': return 'Group has reached its capacity of 30 appointments';
    case 'INSPECTOR_INELIGIBLE': return 'The group\'s assigned inspector is not eligible for this appointment\'s agency or region';
  }
}
