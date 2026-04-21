import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IPropertyRepository } from '../../domain/property.repository';
import type { IAppointmentChecker } from '../../../tenant/domain/appointment-checker';
import {
  PropertyNotFoundError,
  PropertyAlreadyDeletedError,
  PropertyHasActiveAppointmentsError,
} from '../../domain/property.errors';

export interface DeletePropertyInput {
  propertyId: string;
  actor: AuthContext;
}

export class DeletePropertyUseCase {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
    private readonly appointmentChecker: IAppointmentChecker,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeletePropertyInput): Promise<void> {
    const { propertyId, actor } = input;

    // RBAC: AM/OP any, CL_ADMIN own tenant. CL_USER and INSP forbidden.
    if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      actor.role !== 'CL_ADMIN'
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // Resolve tenant scope for lookup:
    //   - AM / OP: cross-tenant → `null` (repo omits the tenant_id filter).
    //   - CL_ADMIN: pinned to the JWT tenantId.
    // Previously this used `''` as a magic "global scope" sentinel because
    // the repo's `buildWhere` treats the empty string as falsy. That's
    // fragile — a caller passing a genuinely empty tenantId by mistake
    // would silently escalate to cross-tenant. Using `null` keeps the
    // same runtime behaviour (the repo already handles null properly)
    // while making the intent explicit and type-safe.
    const tenantId: string | null =
      actor.role === 'AM' || actor.role === 'OP' ? null : actor.tenantId;

    const property = await this.propertyRepo.findById(propertyId, tenantId);
    if (!property) {
      throw new PropertyNotFoundError();
    }

    // Verify tenant scope for CL_ADMIN
    if (actor.role === 'CL_ADMIN' && property.tenantId !== actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    if (property.isDeleted()) {
      throw new PropertyAlreadyDeletedError();
    }

    const hasActive = await this.appointmentChecker.hasOpenAppointmentsForProperty(propertyId);
    if (hasActive) {
      throw new PropertyHasActiveAppointmentsError();
    }

    const now = new Date();
    await this.propertyRepo.update(propertyId, property.tenantId, {
      deletedAt: now,
    });

    this.auditService.log({
      action: 'property.deleted',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Property',
      entityId: propertyId,
      tenantId: property.tenantId,
      before: { deletedAt: null },
      after: { deletedAt: now },
    });
  }
}
