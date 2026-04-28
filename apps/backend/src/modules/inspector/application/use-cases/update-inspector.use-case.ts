import type {
  AuthContext,
  PaymentSettings,
  ServiceTypeEntry,
  ClientEligibilityEntry,
} from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
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
    paymentSettings?: PaymentSettings;
    regions?: string[];
    regionIds?: string[];
    serviceTypes?: ServiceTypeEntry[];
    /** @deprecated Kept for backwards-compatibility; use blockedClients. */
    clientEligibility?: ClientEligibilityEntry[];
    blockedClients?: string[];
    fullName?: string | null;
    address?: Record<string, unknown> | null;
    abn?: string | null;
    dateOfBirth?: string | null;
    insuranceFileKey?: string | null;
    insuranceExpiresAt?: string | null;
    policeCheckFileKey?: string | null;
    policeCheckExpiresAt?: string | null;
  };
  actor: AuthContext;
}

export interface UpdateInspectorOutput {
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

export class UpdateInspectorUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
    private readonly serviceRegionRepo?: IServiceRegionRepository,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(input: UpdateInspectorInput): Promise<UpdateInspectorOutput> {
    const { inspectorId, data, actor } = input;

    this.authorizationService!.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector.update',
      entityType: 'Inspector',
    });

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
    if (data.serviceTypes !== undefined) updateData.serviceTypesJson = data.serviceTypes;
    if (data.clientEligibility !== undefined) updateData.clientEligibilityJson = data.clientEligibility;
    if (data.blockedClients !== undefined) updateData.blockedClientsJson = data.blockedClients;
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.abn !== undefined) updateData.abn = data.abn;
    if (data.dateOfBirth !== undefined)
      updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.insuranceFileKey !== undefined) updateData.insuranceFileKey = data.insuranceFileKey;
    if (data.insuranceExpiresAt !== undefined)
      updateData.insuranceExpiresAt = data.insuranceExpiresAt ? new Date(data.insuranceExpiresAt) : null;
    if (data.policeCheckFileKey !== undefined) updateData.policeCheckFileKey = data.policeCheckFileKey;
    if (data.policeCheckExpiresAt !== undefined)
      updateData.policeCheckExpiresAt = data.policeCheckExpiresAt ? new Date(data.policeCheckExpiresAt) : null;

    await this.inspectorRepo.update(inspectorId, updateData);

    // Update service region links if regionIds provided
    if (data.regionIds !== undefined && this.serviceRegionRepo) {
      await this.serviceRegionRepo.setInspectorRegions(inspectorId, data.regionIds);
    }

    const resolvedRegionIds = this.serviceRegionRepo
      ? await this.serviceRegionRepo.getInspectorRegionIds(inspectorId)
      : [];

    const after = {
      name: (updateData.name as string) ?? inspector.name,
      email: (updateData.email as string) ?? inspector.email,
      phone: (updateData.phone as string | null) ?? inspector.phone,
      status: (updateData.status as string) ?? inspector.status,
      paymentSettingsJson: (updateData.paymentSettingsJson as PaymentSettings) ?? inspector.paymentSettingsJson,
      regionIds: resolvedRegionIds,
      serviceTypesJson: (updateData.serviceTypesJson as ServiceTypeEntry[]) ?? inspector.serviceTypesJson,
      clientEligibilityJson: (updateData.clientEligibilityJson as ClientEligibilityEntry[]) ?? inspector.clientEligibilityJson,
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
      regionIds: after.regionIds,
      serviceTypesJson: after.serviceTypesJson,
      clientEligibilityJson: after.clientEligibilityJson,
      createdAt: inspector.createdAt,
      updatedAt: new Date(),
    };
  }
}
