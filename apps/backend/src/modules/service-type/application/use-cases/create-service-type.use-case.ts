import type { AuthContext, ServiceTypeFlowType } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceTypeRepository } from '../../domain/service-type.repository';
import { ServiceTypeEntity } from '../../domain/service-type.entity';
import { ServiceTypeCodeConflictError, ServiceTypeNameConflictError } from '../../domain/service-type.errors';

export interface CreateServiceTypeInput {
  code: string;
  name: string;
  flowType: ServiceTypeFlowType;
  requiresTenantConfirmation: boolean;
  actor: AuthContext;
}

export interface CreateServiceTypeOutput {
  id: string;
  code: string;
  name: string;
  flowType: string;
  requiresTenantConfirmation: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CreateServiceTypeUseCase {
  constructor(
    private readonly serviceTypeRepo: IServiceTypeRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateServiceTypeInput): Promise<CreateServiceTypeOutput> {
    const { code, name, flowType, requiresTenantConfirmation, actor } = input;

    if (actor.role !== 'AM') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const existing = await this.serviceTypeRepo.findByCode(code);
    if (existing) {
      throw new ServiceTypeCodeConflictError();
    }

    const existingByName = await this.serviceTypeRepo.findByName(name);
    if (existingByName) {
      throw new ServiceTypeNameConflictError();
    }

    const now = new Date();
    const id = crypto.randomUUID();

    const serviceType = new ServiceTypeEntity({
      id,
      code,
      name,
      flowType,
      requiresTenantConfirmation,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    await this.serviceTypeRepo.save(serviceType);

    this.auditService.log({
      action: 'service_type.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceType',
      entityId: id,
      after: {
        id,
        code,
        name,
        flowType,
        requiresTenantConfirmation: serviceType.requiresTenantConfirmation,
        status: 'ACTIVE',
      },
    });

    return {
      id: serviceType.id,
      code: serviceType.code,
      name: serviceType.name,
      flowType: serviceType.flowType,
      requiresTenantConfirmation: serviceType.requiresTenantConfirmation,
      status: serviceType.status,
      createdAt: serviceType.createdAt,
      updatedAt: serviceType.updatedAt,
    };
  }
}
