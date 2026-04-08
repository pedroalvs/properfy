import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import {
  AppointmentNotFoundError,
  AppointmentNotDraftError,
} from '../../domain/appointment.errors';

export interface DeleteAppointmentInput {
  appointmentId: string;
  actor: AuthContext;
}

export class DeleteAppointmentUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeleteAppointmentInput): Promise<void> {
    const { appointmentId, actor } = input;

    // 1. AM-only
    if (actor.role !== 'AM') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Only Admin Master can delete appointments');
    }

    // 2. Load appointment (AM has no tenantId constraint)
    const record = await this.appointmentRepo.findById(appointmentId, null);
    if (!record || record.appointment.isDeleted()) {
      throw new AppointmentNotFoundError();
    }

    const appointment = record.appointment;

    // 3. DRAFT-only
    if (appointment.status !== 'DRAFT') {
      throw new AppointmentNotDraftError();
    }

    // 4. Soft-delete
    const now = new Date();
    await this.appointmentRepo.update(appointmentId, appointment.tenantId, {
      deletedAt: now,
    });

    // 5. Audit
    this.auditService.log({
      action: 'appointment.deleted',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      before: {
        id: appointmentId,
        status: appointment.status,
        deletedAt: null,
      },
      after: {
        id: appointmentId,
        status: appointment.status,
        deletedAt: now.toISOString(),
      },
    });
  }
}
