import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IAppointmentChecker } from '../../domain/appointment-checker';
import {
  TenantNotFoundError,
  TenantAlreadyInactiveError,
  TenantHasOpenAppointmentsError,
} from '../../domain/tenant.errors';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { TENANT_EVENTS } from '../../../../shared/application/events/domain-event-bus';

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
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: DeactivateTenantInput): Promise<DeactivateTenantOutput> {
    const { tenantId, reason, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'tenant.deactivate',
      entityType: 'Tenant',
      entityId: tenantId,
    });

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

    this.eventBus?.emit({
      type: TENANT_EVENTS.DEACTIVATED,
      payload: { tenantId, reason },
      occurredAt: new Date(),
    });

    return {
      id: tenantId,
      name: tenant.name,
      status: 'INACTIVE',
      deactivatedAt: now,
    };
  }
}
