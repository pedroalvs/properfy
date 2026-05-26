import type { AuthContext } from '@properfy/shared';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ITenantPortalTokenRepository } from '../../../tenant-portal/domain/tenant-portal-token.repository';
import type { ConfirmationCycleService } from '../services/confirmation-cycle.service';
import { DomainError } from '../../../../shared/domain/errors';
import { AppointmentNotFoundError, AppointmentDateInPastError, AppointmentTimeInPastError } from '../../domain/appointment.errors';
import { validateEditedSchedule } from '@properfy/shared';

export class AppointmentNotScheduledError extends DomainError {
  constructor(currentStatus: string) {
    super(
      'APPOINTMENT_NOT_SCHEDULED',
      `Appointment must be in SCHEDULED status to reopen for reschedule, current status is ${currentStatus}`,
      422,
    );
  }
}

export interface ReopenForRescheduleInput {
  appointmentId: string;
  newScheduledDate: string; // YYYY-MM-DD
  newTimeSlot: string; // HH:mm-HH:mm
  reason?: string;
  actorTimezone?: string;
  actor: AuthContext;
}

export interface ReopenForRescheduleOutput {
  id: string;
  previousStatus: string;
  status: string;
  previousScheduledDate: string;
  scheduledDate: string;
  previousTimeSlot: string;
  timeSlot: string;
  previousInspectorId: string | null;
  inspectorId: null;
  tenantConfirmationStatus: string;
}

export class ReopenForRescheduleUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    /**
     * 026 §FR-543 — optional dependency. When provided, all active portal
     * tokens for the appointment are revoked after the reschedule (the
     * underlying scheduledDate changed, so the existing token URL would
     * land on a stale date). The dependency is OPTIONAL so existing
     * callers that constructed this use case without it keep working —
     * the additive code path is gated by `if (this.tokenRepo)`.
     */
    private readonly tokenRepo?: ITenantPortalTokenRepository,
    /** 028 — optional. When wired, supersedes the current confirmation cycle on reopen. */
    private readonly cycleService?: ConfirmationCycleService,
    private readonly prisma?: PrismaClient,
  ) {}

  async execute(input: ReopenForRescheduleInput): Promise<ReopenForRescheduleOutput> {
    const { appointmentId, newScheduledDate, newTimeSlot, reason, actor } = input;

    // 1. RBAC: CL_ADMIN can reopen (F1 — Revisor cycle 11); SYS for tenant portal flow.
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'SYS', 'CL_ADMIN'], { action: 'appointment.reopen_reschedule', entityType: 'Appointment' });

    // 2. Resolve tenant scope for lookup. AM and OP are cross-tenant per
    //    Constitution v1.3.0; SYS carries the appointment's tenant in its
    //    actor for the tenant-portal flow but is treated as global at lookup.
    //    CL_ADMIN (and any future CL_* role) is tenant-scoped — pin findById
    //    to actor.tenantId so an attacker with a foreign appointment ID gets
    //    a 404, not unintended access (Revisor cycle 2/2 finding).
    const isTenantScoped = actor.role === 'CL_ADMIN' || actor.role === 'CL_USER';
    const tenantScope = isTenantScoped ? actor.tenantId : null;
    const result = await this.appointmentRepo.findById(appointmentId, tenantScope);
    if (!result) {
      throw new AppointmentNotFoundError();
    }

    const { appointment } = result;

    // 2b. Defense-in-depth: even if the repository did not filter, reject when
    //     a tenant-scoped role's claim does not match the appointment's tenant.
    if (isTenantScoped && appointment.tenantId !== actor.tenantId) {
      throw new AppointmentNotFoundError();
    }

    // 3. Validate appointment is SCHEDULED
    if (appointment.status !== 'SCHEDULED') {
      throw new AppointmentNotScheduledError(appointment.status);
    }

    // 3b. TZ-aware past-date/time validation for the new schedule (R7: falls back to UTC).
    const tz = input.actorTimezone ?? 'UTC';
    const existingDateStr = appointment.scheduledDate.toISOString().slice(0, 10);
    const scheduleCheck = validateEditedSchedule({
      existingDate: existingDateStr,
      existingTimeSlot: appointment.timeSlot,
      newDate: newScheduledDate,
      newTimeSlot,
      tz,
    });
    if (!scheduleCheck.ok) {
      throw scheduleCheck.code === 'TIME_IN_PAST' ? new AppointmentTimeInPastError() : new AppointmentDateInPastError();
    }

    // 4. Capture before state for audit
    const previousScheduledDate = appointment.scheduledDate.toISOString().slice(0, 10);
    const beforeSnapshot = {
      status: appointment.status,
      scheduledDate: previousScheduledDate,
      timeSlot: appointment.timeSlot,
      inspectorId: appointment.inspectorId,
      tenantConfirmationStatus: appointment.tenantConfirmationStatus,
    };

    // 5. Atomic update: revert to DRAFT, update date/time, clear inspector.
    // When cycleService is wired, supersede the current cycle within the same transaction
    // so the denorm status is driven exclusively by ConfirmationCycleService.
    const doUpdate = async (tx?: Prisma.TransactionClient) => {
      if (this.cycleService) {
        await this.appointmentRepo.update(appointmentId, appointment.tenantId, {
          status: 'DRAFT',
          scheduledDate: new Date(newScheduledDate),
          timeSlot: newTimeSlot,
          inspectorId: null,
          reason: null,
        });
        await this.cycleService.invalidateOnReopen(appointmentId, appointment.tenantId, tx);
      } else {
        await this.appointmentRepo.update(appointmentId, appointment.tenantId, {
          status: 'DRAFT',
          scheduledDate: new Date(newScheduledDate),
          timeSlot: newTimeSlot,
          inspectorId: null,
          reason: null,
          tenantConfirmationStatus: 'PENDING',
        });
      }
    };

    if (this.cycleService && this.prisma) {
      await this.prisma.$transaction((tx) => doUpdate(tx));
    } else {
      await doUpdate();
    }

    // 6. Audit log -- single composite entry for the entire reschedule operation
    const afterSnapshot = {
      status: 'DRAFT',
      scheduledDate: newScheduledDate,
      timeSlot: newTimeSlot,
      inspectorId: null,
      tenantConfirmationStatus: 'PENDING',
    };

    this.auditService.log({
      action: 'appointment.rescheduled',
      actorType: actor.role === 'SYS' ? 'SYSTEM' : 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      before: beforeSnapshot,
      after: afterSnapshot,
      reason: reason ?? 'Reopened for reschedule',
      metadata: {
        previousInspectorId: appointment.inspectorId,
        initiatedBy: actor.role,
      },
    });

    // 7. 026 §FR-543 — revoke active portal tokens. The scheduledDate
    // changed; existing tokens point at the old URL/payload and would
    // confuse the tenant. Additive when `tokenRepo` is wired into the
    // container; older callers that omit the dep skip this step entirely.
    if (this.tokenRepo) {
      await this.tokenRepo.revokeAllForAppointment(appointmentId);
      this.auditService.log({
        action: 'tenant_portal.tokens_revoked',
        actorType: actor.role === 'SYS' ? 'SYSTEM' : 'USER',
        actorId: actor.userId,
        entityType: 'Appointment',
        entityId: appointmentId,
        tenantId: appointment.tenantId,
        metadata: { reason: 'operator_reschedule', initiatedBy: actor.role },
      });
    }

    return {
      id: appointmentId,
      previousStatus: 'SCHEDULED',
      status: 'DRAFT',
      previousScheduledDate,
      scheduledDate: newScheduledDate,
      previousTimeSlot: appointment.timeSlot,
      timeSlot: newTimeSlot,
      previousInspectorId: appointment.inspectorId,
      inspectorId: null,
      tenantConfirmationStatus: 'PENDING',
    };
  }
}
