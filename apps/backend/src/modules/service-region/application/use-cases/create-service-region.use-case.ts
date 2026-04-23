import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import { ServiceRegionEntity } from '../../domain/service-region.entity';
import { ServiceRegionNameConflictError } from '../../domain/service-region.errors';

export interface CreateServiceRegionInput {
  name: string;
  geojson: Record<string, unknown>;
  color?: string;
  tenantId?: string;
  actor: AuthContext;
}

export interface CreateServiceRegionOutput {
  id: string;
  name: string;
  geojson: Record<string, unknown>;
  color: string;
  status: string;
  createdAt: Date;
}

export class CreateServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: CreateServiceRegionInput): Promise<CreateServiceRegionOutput> {
    const { name, geojson, color, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_region.create', entityType: 'ServiceRegion' });

    const tenantId = this.resolveTenantId(actor, input.tenantId);

    // Check name uniqueness within tenant
    const existing = await this.regionRepo.findByName(tenantId, name);
    if (existing) {
      throw new ServiceRegionNameConflictError();
    }

    const now = new Date();
    const id = crypto.randomUUID();
    const resolvedColor = color ?? '#3b82f6';

    const region = new ServiceRegionEntity({
      id,
      tenantId,
      name,
      geojson,
      color: resolvedColor,
      status: 'ACTIVE',
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.regionRepo.save(region);

    this.auditService.log({
      action: 'service_region.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceRegion',
      entityId: id,
      after: {
        id,
        tenantId,
        name,
        color: resolvedColor,
        status: 'ACTIVE',
      },
    });

    return {
      id,
      name,
      geojson,
      color: resolvedColor,
      status: 'ACTIVE',
      createdAt: now,
    };
  }

  private resolveTenantId(actor: AuthContext, explicitTenantId?: string): string {
    // AM has null tenantId in JWT; fall back to explicitly supplied tenantId from request body
    const resolved = actor.tenantId ?? explicitTenantId;
    if (!resolved) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Tenant context is required for this operation');
    }
    return resolved;
  }
}
