import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ITenantPortalTokenRepository } from '../../../tenant-portal/domain/tenant-portal-token.repository';
import { DomainError } from '../../../../shared/domain/errors';
import { AppointmentNotFoundError } from '../../domain/appointment.errors';

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
  ) {}

  async execute(input: ReopenForRescheduleInput): Promise<ReopenForRescheduleOutput> {
    const { appointmentId, newScheduledDate, newTimeSlot, reason, actor } = input;

    // 1. RBAC: only SYS (tenant portal), AM, or OP can reopen for reschedule
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'SYS'], { action: 'appointment.reopen_reschedule', entityType: 'Appointment' });

    // 2. Find appointment (AM/OP/SYS have global access)
    const result = await this.appointmentRepo.findById(appointmentId, null);
    if (!result) {
      throw new AppointmentNotFoundError();
    }

    const { appointment } = result;

    // 3. Validate appointment is SCHEDULED
    if (appointment.status !== 'SCHEDULED') {
      throw new AppointmentNotScheduledError(appointment.status);
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

    // 5. Atomic update: revert to DRAFT, update date/time, clear inspector, reset confirmation
    await this.appointmentRepo.update(appointmentId, appointment.tenantId, {
      status: 'DRAFT',
      scheduledDate: new Date(newScheduledDate),
      timeSlot: newTimeSlot,
      inspectorId: null,
      tenantConfirmationStatus: 'PENDING',
      reason: null,
    });

    // 6. Audit log -- single composite entry for the entire reschedule operation
    const afterSnapshot = {
      status: 'DRAFT',
      scheduledDate: newScheduledDate,
      timeSlot: newTimeSlot,
      inspectorId: null,
      tenantConfirmationStatus: 'PENDING',
    };

    this.auditService.log({
      action: 'appointment.reopened_for_reschedule',
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
