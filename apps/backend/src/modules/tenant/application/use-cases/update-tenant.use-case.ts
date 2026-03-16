import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../domain/tenant.repository';
import {
  TenantNotFoundError,
  TenantLegalNameConflictError,
} from '../../domain/tenant.errors';
import { deepMerge } from '../../../../shared/domain/utils';

export interface UpdateTenantInput {
  tenantId: string;
  data: {
    name?: string;
    legalName?: string;
    timezone?: string;
    currency?: string;
    settings?: Record<string, unknown>;
  };
  actor: AuthContext;
}

export interface UpdateTenantOutput {
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

export class UpdateTenantUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateTenantInput): Promise<UpdateTenantOutput> {
    const { tenantId, actor } = input;
    let { data } = input;

    // RBAC: AM can update all fields; CL_ADMIN own tenant, limited to name and settings
    if (actor.role === 'AM') {
      // Full access
    } else if (actor.role === 'CL_ADMIN' && actor.tenantId === tenantId) {
      // Strip fields CL_ADMIN cannot update
      data = {
        name: data.name,
        settings: data.settings,
      };
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    // Check legalName uniqueness if changing
    if (data.legalName && data.legalName !== tenant.legalName) {
      const existing = await this.tenantRepo.findByLegalName(data.legalName);
      if (existing) {
        throw new TenantLegalNameConflictError();
      }
    }

    const before = {
      name: tenant.name,
      legalName: tenant.legalName,
      timezone: tenant.timezone,
      currency: tenant.currency,
      settingsJson: tenant.settingsJson,
    };

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.legalName !== undefined) updateData.legalName = data.legalName;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.settings !== undefined) {
      updateData.settingsJson = deepMerge(tenant.settingsJson, data.settings);
    }

    await this.tenantRepo.update(tenantId, updateData);

    const after = {
      name: (updateData.name as string) ?? tenant.name,
      legalName: (updateData.legalName as string) ?? tenant.legalName,
      timezone: (updateData.timezone as string) ?? tenant.timezone,
      currency: (updateData.currency as string) ?? tenant.currency,
      settingsJson:
        (updateData.settingsJson as Record<string, unknown>) ??
        tenant.settingsJson,
    };

    this.auditService.log({
      action: 'tenant.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Tenant',
      entityId: tenantId,
      tenantId,
      before,
      after,
    });

    return {
      id: tenant.id,
      name: after.name,
      legalName: after.legalName,
      status: tenant.status,
      timezone: after.timezone,
      currency: after.currency,
      settingsJson: after.settingsJson,
      createdAt: tenant.createdAt,
      updatedAt: new Date(),
    };
  }
}
