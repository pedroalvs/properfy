import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import { ServiceRegionNotFoundError } from '../../domain/service-region.errors';

interface UserReader {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}

export interface GetServiceRegionInput {
  regionId: string;
  actor: AuthContext;
}

export interface GetServiceRegionOutput {
  id: string;
  name: string;
  geojson: Record<string, unknown>;
  color: string;
  status: string;
  createdByUserId: string | null;
  createdByUserName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class GetServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly userReader?: UserReader,
  ) {}

  async execute(input: GetServiceRegionInput): Promise<GetServiceRegionOutput> {
    const { regionId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'INSP'], { action: 'service_region.list', entityType: 'ServiceRegion' });

    const tenantId = this.resolveTenantId(actor);

    const region = await this.regionRepo.findById(regionId, tenantId);
    if (!region) {
      throw new ServiceRegionNotFoundError();
    }

    let createdByUserName: string | null = null;
    if (region.createdByUserId && this.userReader) {
      const user = await this.userReader.findById(region.createdByUserId);
      createdByUserName = user?.name ?? null;
    }

    return {
      id: region.id,
      name: region.name,
      geojson: region.geojson,
      color: region.color,
      status: region.status,
      createdByUserId: region.createdByUserId,
      createdByUserName,
      createdAt: region.createdAt,
      updatedAt: region.updatedAt,
    };
  }

  private resolveTenantId(actor: AuthContext): string {
    if (!actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Tenant context is required');
    }
    return actor.tenantId;
  }
}
