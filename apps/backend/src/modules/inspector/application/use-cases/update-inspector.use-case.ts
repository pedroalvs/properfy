import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import {
  InspectorNotFoundError,
  InspectorEmailConflictError,
} from '../../domain/inspector.errors';

export interface UpdateInspectorInput {
  inspectorId: string;
  data: {
    name?: string;
    email?: string;
    phone?: string | null;
    status?: string;
    paymentSettings?: Record<string, unknown>;
    regions?: string[];
    regionIds?: string[];
    serviceTypes?: string[];
    clientEligibility?: string[];
  };
  actor: AuthContext;
}

export interface UpdateInspectorOutput {
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

export class UpdateInspectorUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateInspectorInput): Promise<UpdateInspectorOutput> {
    const { inspectorId, data, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    // Check email uniqueness if changing
    if (data.email && data.email !== inspector.email) {
      const existing = await this.inspectorRepo.findByEmail(data.email);
      if (existing) {
        throw new InspectorEmailConflictError();
      }
    }

    const before = {
      name: inspector.name,
      email: inspector.email,
      phone: inspector.phone,
      status: inspector.status,
      paymentSettingsJson: inspector.paymentSettingsJson,
      regionsJson: inspector.regionsJson,
      serviceTypesJson: inspector.serviceTypesJson,
      clientEligibilityJson: inspector.clientEligibilityJson,
    };

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.paymentSettings !== undefined) updateData.paymentSettingsJson = data.paymentSettings;
    if (data.regions !== undefined) updateData.regionsJson = data.regions;
    if (data.serviceTypes !== undefined) updateData.serviceTypesJson = data.serviceTypes;
    if (data.clientEligibility !== undefined) updateData.clientEligibilityJson = data.clientEligibility;

    await this.inspectorRepo.update(inspectorId, updateData);

    // Update service region links if regionIds provided
    if (data.regionIds !== undefined) {
      await this.inspectorRepo.setServiceRegions(inspectorId, data.regionIds);
    }

    const after = {
      name: (updateData.name as string) ?? inspector.name,
      email: (updateData.email as string) ?? inspector.email,
      phone: (updateData.phone as string | null) ?? inspector.phone,
      status: (updateData.status as string) ?? inspector.status,
      paymentSettingsJson: (updateData.paymentSettingsJson as Record<string, unknown>) ?? inspector.paymentSettingsJson,
      regionsJson: (updateData.regionsJson as string[]) ?? inspector.regionsJson,
      serviceTypesJson: (updateData.serviceTypesJson as string[]) ?? inspector.serviceTypesJson,
      clientEligibilityJson: (updateData.clientEligibilityJson as string[]) ?? inspector.clientEligibilityJson,
    };

    this.auditService.log({
      action: 'inspector.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      before,
      after,
    });

    return {
      id: inspector.id,
      name: after.name,
      email: after.email,
      phone: after.phone,
      status: after.status,
      paymentSettingsJson: after.paymentSettingsJson,
      regionsJson: after.regionsJson,
      serviceTypesJson: after.serviceTypesJson,
      clientEligibilityJson: after.clientEligibilityJson,
      createdAt: inspector.createdAt,
      updatedAt: new Date(),
    };
  }
}
