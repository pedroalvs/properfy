import type {
  AuthContext,
  PaymentSettings,
  ServiceTypeEntry,
} from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
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
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateInspectorUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
    private readonly serviceRegionRepo?: IServiceRegionRepository,
    private readonly authorizationService?: AuthorizationService,
    private readonly userManagementRepo?: IUserManagementRepository,
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
    const emailChanged = Boolean(data.email && data.email !== inspector.email);
    if (emailChanged) {
      const existing = await this.inspectorRepo.findByEmail(data.email!);
      if (existing) {
        throw new InspectorEmailConflictError();
      }

      // The email doubles as the login identity, so it must also be free among
      // users. A self-match is fine — that is this inspector's own account.
      const existingUser = await this.userManagementRepo?.findByEmail(data.email!);
      if (existingUser && existingUser.id !== inspector.userId) {
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
    };

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.paymentSettings !== undefined) updateData.paymentSettingsJson = data.paymentSettings;
    if (data.serviceTypes !== undefined) updateData.serviceTypesJson = data.serviceTypes;
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

    // Keep the login account in step: otherwise the UI shows the new address
    // while authentication still expects the old one, and the PWA forgot-password
    // flow silently no-ops because it cannot find the new email.
    if (emailChanged && inspector.userId && this.userManagementRepo) {
      await this.userManagementRepo.update(inspector.userId, null, { email: data.email! });
    }

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
      createdAt: inspector.createdAt,
      updatedAt: new Date(),
    };
  }
}
