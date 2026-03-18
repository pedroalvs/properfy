import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import { AppointmentNotFoundError } from '../../domain/appointment.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { assertClUserPermission } from '../../../../shared/domain/cl-user-permissions';

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
    private readonly tenantRepo?: ITenantRepository,
  ) {}

  async execute(input: ForceManualConfirmationInput): Promise<ForceManualConfirmationOutput> {
    const { appointmentId, tenantConfirmationStatus, reason, actor } = input;

    // 1. RBAC: AM/OP allowed, CL_USER with force_confirmation permission
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      if (actor.role === 'CL_USER' && this.tenantRepo) {
        await assertClUserPermission(this.tenantRepo, actor.tenantId!, 'force_confirmation');
      } else {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
      }
    }

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
