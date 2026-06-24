import type { AuthContext } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { NotFoundError } from '../../../../shared/domain/errors';
import { ServiceGroupValidator, type AddToGroupReason } from '../../domain/service-group.validator';

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
 */
export class AddAppointmentsToGroupUseCase {
  constructor(
    private readonly groupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
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
          scheduledDate: appointment.scheduledDate,
        },
        {
          status: group.status,
          serviceTypeId: group.serviceTypeId,
          scheduledDate: group.scheduledDate,
          currentSize,
        },
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
        await this.groupRepo.linkAppointments([apptId], input.groupId);
        currentSize += 1;

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

    return { results };
  }
}

function reasonMessage(code: AddToGroupReason): string {
  switch (code) {
    case 'INVALID_STATUS': return 'Appointment must be in DRAFT or AWAITING_INSPECTOR status';
    case 'ALREADY_GROUPED': return 'Appointment is already linked to another service group';
    case 'INVALID_SERVICE_TYPE': return 'Appointment service type does not match the group';
    case 'INVALID_DATE': return 'Appointment scheduled date does not match the group';
    case 'GROUP_IN_TERMINAL_STATE': return 'Group is in a terminal state and cannot accept new appointments';
    case 'GROUP_CAPACITY_EXCEEDED': return 'Group has reached its capacity of 30 appointments';
  }
}
