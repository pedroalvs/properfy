import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBranchRepository } from '../../domain/branch.repository';
import {
  TenantNotFoundError,
  BranchNotFoundError,
  BranchAlreadyActiveError,
} from '../../domain/tenant.errors';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { BRANCH_EVENTS } from '../../../../shared/application/events/domain-event-bus';

export interface ActivateBranchInput {
  tenantId: string;
  branchId: string;
  actor: AuthContext;
}

export interface ActivateBranchOutput {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  activatedAt: Date;
}

export class ActivateBranchUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: ActivateBranchInput): Promise<ActivateBranchOutput> {
    const { tenantId, branchId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'tenant.activate',
      entityType: 'Branch',
      entityId: branchId,
    });

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    const branch = await this.branchRepo.findById(branchId, tenantId);
    if (!branch || branch.isDeleted()) {
      throw new BranchNotFoundError();
    }

    if (branch.isActive()) {
      throw new BranchAlreadyActiveError();
    }

    const now = new Date();
    await this.branchRepo.update(branchId, tenantId, {
      status: 'ACTIVE',
    });

    this.auditService.log({
      action: 'branch.activated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Branch',
      entityId: branchId,
      tenantId,
      before: { status: branch.status },
      after: { status: 'ACTIVE' },
    });

    this.eventBus?.emit({
      type: BRANCH_EVENTS.ACTIVATED,
      payload: { branchId, tenantId },
      occurredAt: new Date(),
    });

    return {
      id: branchId,
      tenantId,
      name: branch.name,
      status: 'ACTIVE',
      activatedAt: now,
    };
  }
}
