import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IAppointmentChecker } from '../../domain/appointment-checker';
import {
  TenantNotFoundError,
  TenantAlreadyInactiveError,
  TenantHasOpenAppointmentsError,
} from '../../domain/tenant.errors';

export interface DeactivateTenantInput {
  tenantId: string;
  reason: string;
  actor: AuthContext;
}

export interface DeactivateTenantOutput {
  id: string;
  name: string;
  status: string;
  deactivatedAt: Date;
}

export class DeactivateTenantUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly appointmentChecker: IAppointmentChecker,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeactivateTenantInput): Promise<DeactivateTenantOutput> {
    const { tenantId, reason, actor } = input;

    if (actor.role !== 'AM') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    if (!tenant.canBeDeactivated()) {
      throw new TenantAlreadyInactiveError();
    }

    const hasOpenAppointments =
      await this.appointmentChecker.hasOpenAppointmentsForTenant(tenantId);
    if (hasOpenAppointments) {
      throw new TenantHasOpenAppointmentsError();
    }

    const now = new Date();
    await this.tenantRepo.update(tenantId, {
      status: 'INACTIVE',
    });

    this.auditService.log({
      action: 'tenant.deactivated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Tenant',
      entityId: tenantId,
      tenantId,
      before: { status: tenant.status },
      after: { status: 'INACTIVE' },
      reason,
    });

    return {
      id: tenantId,
      name: tenant.name,
      status: 'INACTIVE',
      deactivatedAt: now,
    };
  }
}
