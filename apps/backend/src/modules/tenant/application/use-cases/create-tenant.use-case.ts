import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../domain/tenant.repository';
import { TenantEntity } from '../../domain/tenant.entity';
import { TenantLegalNameConflictError } from '../../domain/tenant.errors';

export interface CreateTenantInput {
  name: string;
  legalName: string;
  timezone: string;
  currency: string;
  settings?: Record<string, unknown>;
  actor: AuthContext;
}

export interface CreateTenantOutput {
  id: string;
  name: string;
  legalName: string;
  status: string;
  timezone: string;
  currency: string;
  settingsJson: Record<string, unknown>;
  createdAt: Date;
}

export class CreateTenantUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateTenantInput): Promise<CreateTenantOutput> {
    const { name, legalName, timezone, currency, settings, actor } = input;

    if (actor.role !== 'AM') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const existing = await this.tenantRepo.findByLegalName(legalName);
    if (existing) {
      throw new TenantLegalNameConflictError();
    }

    const now = new Date();
    const id = crypto.randomUUID();

    const tenant = new TenantEntity({
      id,
      name,
      legalName,
      status: 'PENDING',
      timezone,
      currency,
      settingsJson: settings ?? {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.tenantRepo.save(tenant);

    this.auditService.log({
      action: 'tenant.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Tenant',
      entityId: id,
      after: {
        id,
        name,
        legalName,
        status: 'PENDING',
        timezone,
        currency,
        settingsJson: tenant.settingsJson,
      },
    });

    return {
      id: tenant.id,
      name: tenant.name,
      legalName: tenant.legalName,
      status: tenant.status,
      timezone: tenant.timezone,
      currency: tenant.currency,
      settingsJson: tenant.settingsJson,
      createdAt: tenant.createdAt,
    };
  }
}
