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

    // 2. Find appointment (AM/OP have global access)
    const result = await this.appointmentRepo.findById(appointmentId, null);
    if (!result) throw new AppointmentNotFoundError();

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
