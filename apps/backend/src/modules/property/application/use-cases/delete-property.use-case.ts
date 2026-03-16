import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IPropertyRepository } from '../../domain/property.repository';
import {
  PropertyNotFoundError,
  PropertyAlreadyDeletedError,
} from '../../domain/property.errors';

export interface DeletePropertyInput {
  propertyId: string;
  actor: AuthContext;
}

export class DeletePropertyUseCase {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
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

    // Resolve tenantId for lookup
    const tenantId =
      actor.role === 'CL_ADMIN' ? actor.tenantId! : '';

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

    // TODO: Check for active appointments (will be added in Session 4 - Appointment module)

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
