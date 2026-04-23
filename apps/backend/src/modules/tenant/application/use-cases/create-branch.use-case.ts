import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBranchRepository } from '../../domain/branch.repository';
import { BranchEntity } from '../../domain/branch.entity';
import {
  TenantNotFoundError,
  TenantInactiveError,
  BranchNameConflictError,
} from '../../domain/tenant.errors';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { BRANCH_EVENTS } from '../../../../shared/application/events/domain-event-bus';

export interface CreateBranchInput {
  tenantId: string;
  name: string;
  address?: Record<string, unknown>;
  contactEmail?: string;
  actor: AuthContext;
}

export interface CreateBranchOutput {
  id: string;
  tenantId: string;
  name: string;
  addressJson: Record<string, unknown> | null;
  contactEmail: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CreateBranchUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: CreateBranchInput): Promise<CreateBranchOutput> {
    const { tenantId, name, address, contactEmail, actor } = input;

    // RBAC: AM any tenant; CL_ADMIN own tenant only
    if (
      actor.role !== 'AM' &&
      (actor.role !== 'CL_ADMIN' || actor.tenantId !== tenantId)
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }
    if (!tenant.isActive()) {
      throw new TenantInactiveError();
    }

    const existingBranch = await this.branchRepo.findByName(tenantId, name);
    if (existingBranch) {
      throw new BranchNameConflictError();
    }

    const now = new Date();
    const id = crypto.randomUUID();

    const branch = new BranchEntity({
      id,
      tenantId,
      name,
      addressJson: address ?? null,
      contactEmail: contactEmail ?? null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.branchRepo.save(branch);

    this.auditService.log({
      action: 'branch.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Branch',
      entityId: id,
      tenantId,
      after: {
        id,
        tenantId,
        name,
        addressJson: branch.addressJson,
        contactEmail: branch.contactEmail,
        status: 'ACTIVE',
      },
    });

    this.eventBus?.emit({
      type: BRANCH_EVENTS.CREATED,
      payload: { branchId: id, tenantId, name },
      occurredAt: new Date(),
    });

    return {
      id: branch.id,
      tenantId: branch.tenantId,
      name: branch.name,
      addressJson: branch.addressJson,
      contactEmail: branch.contactEmail,
      status: branch.status,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    };
  }
}
