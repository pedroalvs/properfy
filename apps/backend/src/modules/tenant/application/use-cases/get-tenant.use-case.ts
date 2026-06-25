import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { ITenantRepository } from '../../domain/tenant.repository';
import { TenantNotFoundError } from '../../domain/tenant.errors';

export interface GetTenantInput {
  tenantId: string;
  actor: AuthContext;
}

export interface GetTenantOutput {
  id: string;
  name: string;
  legalName: string;
  status: string;
  timezone: string;
  currency: string;
  settingsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class GetTenantUseCase {
  constructor(private readonly tenantRepo: ITenantRepository) {}

  async execute(input: GetTenantInput): Promise<GetTenantOutput> {
    const { tenantId, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      if (
        (actor.role !== 'CL_ADMIN' && actor.role !== 'CL_USER') ||
        actor.tenantId !== tenantId
      ) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
      }
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    return {
      id: tenant.id,
      name: tenant.name,
      legalName: tenant.legalName,
      status: tenant.status,
      timezone: tenant.timezone,
      currency: tenant.currency,
      settingsJson: tenant.settingsJson,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }
}
