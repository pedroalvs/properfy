import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ITenantRepository } from '../../domain/tenant.repository';
import {
  TenantNotFoundError,
  TenantAlreadyActiveError,
} from '../../domain/tenant.errors';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { TENANT_EVENTS } from '../../../../shared/application/events/domain-event-bus';

export interface ActivateTenantInput {
  tenantId: string;
  reason?: string;
  actor: AuthContext;
}

export interface ActivateTenantOutput {
  id: string;
  name: string;
  status: string;
  activatedAt: Date;
}

export class ActivateTenantUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: ActivateTenantInput): Promise<ActivateTenantOutput> {
    const { tenantId, reason, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM'], {
      action: 'tenant.activate',
      entityType: 'Tenant',
      entityId: tenantId,
    });

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    if (tenant.isActive()) {
      throw new TenantAlreadyActiveError();
    }

    const now = new Date();
    await this.tenantRepo.update(tenantId, {
      status: 'ACTIVE',
    });

    this.auditService.log({
      action: 'tenant.activated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Tenant',
      entityId: tenantId,
      tenantId,
      before: { status: tenant.status },
      after: { status: 'ACTIVE' },
      reason,
    });

    this.eventBus?.emit({
      type: TENANT_EVENTS.ACTIVATED,
      payload: { tenantId },
      occurredAt: new Date(),
    });

    return {
      id: tenantId,
      name: tenant.name,
      status: 'ACTIVE',
      activatedAt: now,
    };
  }
}
