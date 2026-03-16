import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBranchRepository } from '../../domain/branch.repository';
import type { IAppointmentChecker } from '../../domain/appointment-checker';
import {
  TenantNotFoundError,
  BranchNotFoundError,
  BranchAlreadyInactiveError,
  BranchHasOpenAppointmentsError,
} from '../../domain/tenant.errors';

export interface DeactivateBranchInput {
  tenantId: string;
  branchId: string;
  reason: string;
  actor: AuthContext;
}

export class DeactivateBranchUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly appointmentChecker: IAppointmentChecker,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeactivateBranchInput): Promise<void> {
    const { tenantId, branchId, reason, actor } = input;

    if (actor.role !== 'AM') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

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
    await this.branchRepo.update(branchId, {
      status: 'INACTIVE',
      deletedAt: now,
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
  }
}
