import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IInspectorRepository } from '../../domain/inspector.repository';
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
  paymentSettingsJson: Record<string, unknown>;
  regionsJson: string[];
  serviceTypesJson: string[];
  clientEligibilityJson: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class GetInspectorUseCase {
  constructor(private readonly inspectorRepo: IInspectorRepository) {}

  async execute(input: GetInspectorInput): Promise<GetInspectorOutput> {
    const { inspectorId, actor } = input;

    // TODO: INSP role should be allowed to get their own inspector record once User-Inspector link is established
    if (actor.role === 'INSP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
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

    return {
      id: inspector.id,
      name: inspector.name,
      email: inspector.email,
      phone: inspector.phone,
      status: inspector.status,
      paymentSettingsJson: inspector.paymentSettingsJson,
      regionsJson: inspector.regionsJson,
      serviceTypesJson: inspector.serviceTypesJson,
      clientEligibilityJson: inspector.clientEligibilityJson,
      createdAt: inspector.createdAt,
      updatedAt: inspector.updatedAt,
    };
  }
}
