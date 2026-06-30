import type {
  AuthContext,
  ServiceTypeFlowType,
  ServiceTypeStatus,
} from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceTypeRepository } from '../../domain/service-type.repository';
import { ServiceTypeNotFoundError, ServiceTypeNameConflictError } from '../../domain/service-type.errors';

export interface UpdateServiceTypeInput {
  serviceTypeId: string;
  data: {
    name?: string;
    flowType?: ServiceTypeFlowType;
    requiresRentalTenantConfirmation?: boolean;
    status?: ServiceTypeStatus;
  };
  actor: AuthContext;
}

export interface UpdateServiceTypeOutput {
  id: string;
  code: string;
  name: string;
  flowType: string;
  requiresRentalTenantConfirmation: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateServiceTypeUseCase {
  constructor(
    private readonly serviceTypeRepo: IServiceTypeRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateServiceTypeInput): Promise<UpdateServiceTypeOutput> {
    const { serviceTypeId, data, actor } = input;

    if (actor.role !== 'AM') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const serviceType = await this.serviceTypeRepo.findById(serviceTypeId);
    if (!serviceType) {
      throw new ServiceTypeNotFoundError();
    }

    if (data.name !== undefined && data.name !== serviceType.name) {
      const existingByName = await this.serviceTypeRepo.findByName(data.name);
      if (existingByName && existingByName.id !== serviceTypeId) {
        throw new ServiceTypeNameConflictError();
      }
    }

    const before = {
      name: serviceType.name,
      flowType: serviceType.flowType,
      requiresRentalTenantConfirmation: serviceType.requiresRentalTenantConfirmation,
      status: serviceType.status,
    };

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.flowType !== undefined) updateData.flowType = data.flowType;
    if (data.requiresRentalTenantConfirmation !== undefined)
      updateData.requiresRentalTenantConfirmation = data.requiresRentalTenantConfirmation;
    if (data.status !== undefined) updateData.status = data.status;

    await this.serviceTypeRepo.update(serviceTypeId, updateData);

    const after = {
      name: (updateData.name as string) ?? serviceType.name,
      flowType: (updateData.flowType as string) ?? serviceType.flowType,
      requiresRentalTenantConfirmation:
        (updateData.requiresRentalTenantConfirmation as boolean) ??
        serviceType.requiresRentalTenantConfirmation,
      status: (updateData.status as string) ?? serviceType.status,
    };

    this.auditService.log({
      action: 'service_type.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceType',
      entityId: serviceTypeId,
      before,
      after,
    });

    return {
      id: serviceType.id,
      code: serviceType.code,
      name: after.name,
      flowType: after.flowType,
      requiresRentalTenantConfirmation: after.requiresRentalTenantConfirmation,
      status: after.status,
      createdAt: serviceType.createdAt,
      updatedAt: new Date(),
    };
  }
}
