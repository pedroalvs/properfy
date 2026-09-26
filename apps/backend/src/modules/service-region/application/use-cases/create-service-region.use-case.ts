import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { TenantNotFoundError } from '../../../tenant/domain/tenant.errors';
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
  regionNumber: number;
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
    private readonly tenantRepo: ITenantRepository,
  ) {}

  async execute(input: CreateServiceRegionInput): Promise<CreateServiceRegionOutput> {
    const { name, geojson, color, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_region.create', entityType: 'ServiceRegion' });

    const tenantId = actor.tenantId ?? input.tenantId ?? null;

    // An AM/OP actor (JWT tenantId null) may target any tenant via input.tenantId.
    // That value is client-supplied and — unlike a CL actor's JWT tenantId, which
    // the auth middleware already validated — is otherwise trusted blindly, so
    // confirm the tenant exists before persisting (#385). `null` stays a valid
    // global region for AM/OP.
    if (actor.tenantId === null && input.tenantId != null) {
      const tenant = await this.tenantRepo.findById(input.tenantId);
      if (!tenant) {
        throw new TenantNotFoundError();
      }
    }

    // Check name uniqueness within tenant scope (or globally if no tenant)
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
      // Assigned by the DB sequence during save() and read back onto the entity.
      regionNumber: region.regionNumber,
      name,
      geojson,
      color: resolvedColor,
      status: 'ACTIVE',
      createdAt: now,
    };
  }

}
