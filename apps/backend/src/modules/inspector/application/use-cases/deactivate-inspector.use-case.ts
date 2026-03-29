import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IInspectorAppointmentChecker } from '../../domain/inspector-appointment-checker';
import {
  InspectorNotFoundError,
  InspectorAlreadyInactiveError,
  InspectorHasOpenAppointmentsError,
} from '../../domain/inspector.errors';

export interface DeactivateInspectorInput {
  inspectorId: string;
  reason: string;
  actor: AuthContext;
}

export interface DeactivateInspectorOutput {
  id: string;
  name: string;
  status: string;
  deactivatedAt: Date;
}

export class DeactivateInspectorUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly appointmentChecker: IInspectorAppointmentChecker,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeactivateInspectorInput): Promise<DeactivateInspectorOutput> {
    const { inspectorId, reason, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    if (!inspector.isActive()) {
      throw new InspectorAlreadyInactiveError();
    }

    const { total, byStatus } = await this.appointmentChecker.countOpenAppointmentsForInspector(inspectorId);
    if (total > 0) {
      throw new InspectorHasOpenAppointmentsError(total, byStatus);
    }

    const now = new Date();
    await this.inspectorRepo.update(inspectorId, {
      status: 'INACTIVE',
    });

    this.auditService.log({
      action: 'inspector.deactivated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      before: { status: inspector.status },
      after: { status: 'INACTIVE' },
      reason,
    });

    return {
      id: inspectorId,
      name: inspector.name,
      status: 'INACTIVE',
      deactivatedAt: now,
    };
  }
}
