import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import { AppointmentNotFoundError } from '../../domain/appointment.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface ForceManualConfirmationInput {
  appointmentId: string;
  tenantConfirmationStatus: 'CONFIRMED';
  reason: string;
  actor: AuthContext;
}

export interface ForceManualConfirmationOutput {
  id: string;
  tenantConfirmationStatus: string;
}

export class ForceManualTenantConfirmationUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ForceManualConfirmationInput): Promise<ForceManualConfirmationOutput> {
    const { appointmentId, tenantConfirmationStatus, reason, actor } = input;

    // 1. RBAC: AM/OP allowed, CL_USER with force_confirmation permission
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_USER'], { action: 'appointment.force_confirmation', entityType: 'Appointment' });
    this.authorizationService.assertClUserPermission(actor, 'force_confirmation');

    // 2. Find appointment. AM/OP are platform-wide so we look up across
    // tenants; CL_USER must be pinned to their JWT tenantId to prevent a
    // brute-force write against another tenant's appointment (the use-case
    // accepts a CL_USER actor with the `force_confirmation` permission, but
    // that permission is per-tenant — it must never imply cross-tenant
    // reach). Hardening pass 2026-04-20.
    const tenantScope =
      actor.role === 'AM' || actor.role === 'OP' ? null : actor.tenantId;
    const result = await this.appointmentRepo.findById(appointmentId, tenantScope);
    if (!result) throw new AppointmentNotFoundError();
    if (
      (actor.role === 'CL_USER' || actor.role === 'CL_ADMIN') &&
      result.appointment.tenantId !== actor.tenantId
    ) {
      // Defense in depth: even if the repo ever loosens its tenant filter,
      // the actor must own the row to mutate it.
      throw new AppointmentNotFoundError();
    }

    // 3. Update tenant confirmation status
    await this.appointmentRepo.update(appointmentId, result.appointment.tenantId, {
      tenantConfirmationStatus,
    });

    // 4. Audit
    this.auditService.log({
      action: 'appointment.force_manual_confirmation',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: result.appointment.tenantId,
      before: { tenantConfirmationStatus: result.appointment.tenantConfirmationStatus },
      after: { tenantConfirmationStatus },
      reason,
    });

    return {
      id: appointmentId,
      tenantConfirmationStatus,
    };
  }
}
