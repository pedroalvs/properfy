import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IServiceTypeRepository } from '../../domain/service-type.repository';
import { ServiceTypeNotFoundError } from '../../domain/service-type.errors';

export interface GetServiceTypeInput {
  serviceTypeId: string;
  actor: AuthContext;
}

export interface GetServiceTypeOutput {
  id: string;
  code: string;
  name: string;
  flowType: string;
  requiresTenantConfirmation: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const ALLOWED_ROLES = ['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'INSP'] as const;

export class GetServiceTypeUseCase {
  constructor(private readonly serviceTypeRepo: IServiceTypeRepository) {}

  async execute(input: GetServiceTypeInput): Promise<GetServiceTypeOutput> {
    const { serviceTypeId, actor } = input;

    if (!ALLOWED_ROLES.includes(actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const serviceType = await this.serviceTypeRepo.findById(serviceTypeId);
    if (!serviceType) {
      throw new ServiceTypeNotFoundError();
    }

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
