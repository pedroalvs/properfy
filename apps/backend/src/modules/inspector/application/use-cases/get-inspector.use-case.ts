import type {
  AuthContext,
  PaymentSettings,
  ServiceTypeEntry,
  ClientEligibilityEntry,
} from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import { InspectorNotFoundError } from '../../domain/inspector.errors';

export interface GetInspectorInput {
  inspectorId: string;
  actor: AuthContext;
}

export interface GetInspectorOutput {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  paymentSettingsJson: PaymentSettings;
  regionIds: string[];
  serviceTypesJson: ServiceTypeEntry[];
  clientEligibilityJson: ClientEligibilityEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export class GetInspectorUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly serviceRegionRepo: IServiceRegionRepository,
  ) {}

  async execute(input: GetInspectorInput): Promise<GetInspectorOutput> {
    const { inspectorId, actor } = input;

    if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      if (inspectorId !== actor.inspectorId) {
        throw new ForbiddenError('FORBIDDEN', "Cannot access another inspector's data");
      }
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    // CL_ADMIN and CL_USER can only see eligible inspectors
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      if (!actor.tenantId || !inspector.isEligibleForTenant(actor.tenantId)) {
        throw new InspectorNotFoundError();
      }
    }

    const regionIds = await this.serviceRegionRepo.getInspectorRegionIds(inspector.id);

    return {
      id: inspector.id,
      name: inspector.name,
      email: inspector.email,
      phone: inspector.phone,
      status: inspector.status,
      paymentSettingsJson: inspector.paymentSettingsJson,
      regionIds,
      serviceTypesJson: inspector.serviceTypesJson,
      clientEligibilityJson: inspector.clientEligibilityJson,
      createdAt: inspector.createdAt,
      updatedAt: inspector.updatedAt,
    };
  }
}
