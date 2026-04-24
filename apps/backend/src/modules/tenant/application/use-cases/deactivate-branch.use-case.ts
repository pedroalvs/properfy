import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBranchRepository } from '../../domain/branch.repository';
import type { IAppointmentChecker } from '../../domain/appointment-checker';
import {
  TenantNotFoundError,
  BranchNotFoundError,
  BranchAlreadyInactiveError,
  BranchHasOpenAppointmentsError,
} from '../../domain/tenant.errors';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { BRANCH_EVENTS } from '../../../../shared/application/events/domain-event-bus';

export interface DeactivateBranchInput {
  tenantId: string;
  branchId: string;
  reason: string;
  actor: AuthContext;
}

export interface DeactivateBranchOutput {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  deactivatedAt: Date;
}

export class DeactivateBranchUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly appointmentChecker: IAppointmentChecker,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: DeactivateBranchInput): Promise<DeactivateBranchOutput> {
    const { tenantId, branchId, reason, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'tenant.deactivate',
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

    if (!branch.isActive()) {
      throw new BranchAlreadyInactiveError();
    }

    const hasOpenAppointments =
      await this.appointmentChecker.hasOpenAppointmentsForBranch(branchId);
    if (hasOpenAppointments) {
      throw new BranchHasOpenAppointmentsError();
    }

    const now = new Date();
    await this.branchRepo.update(branchId, tenantId, {
      status: 'INACTIVE',
    });

    this.auditService.log({
      action: 'branch.deactivated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Branch',
      entityId: branchId,
      tenantId,
      before: { status: branch.status },
      after: { status: 'INACTIVE' },
      reason,
    });

    this.eventBus?.emit({
      type: BRANCH_EVENTS.DEACTIVATED,
      payload: { branchId, tenantId, reason },
      occurredAt: new Date(),
    });

    return {
      id: branchId,
      tenantId,
      name: branch.name,
      status: 'INACTIVE',
      deactivatedAt: now,
    };
  }
}
