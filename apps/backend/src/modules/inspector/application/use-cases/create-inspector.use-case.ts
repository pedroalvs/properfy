import bcrypt from 'bcryptjs';
import type {
  AuthContext,
  PaymentSettings,
  ServiceTypeEntry,
  ClientEligibilityEntry,
} from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import { InspectorEntity } from '../../domain/inspector.entity';
import { UserEntity } from '../../../auth/domain/user.entity';
import { InspectorEmailConflictError } from '../../domain/inspector.errors';

export interface CreateInspectorInput {
  name: string;
  email: string;
  phone?: string | null;
  paymentSettings?: PaymentSettings;
  regions?: string[];
  regionIds?: string[];
  serviceTypes?: ServiceTypeEntry[];
  clientEligibility?: ClientEligibilityEntry[];
  actor: AuthContext;
}

export interface CreateInspectorOutput {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  paymentSettingsJson: PaymentSettings;
  regionIds: string[];
  serviceTypesJson: ServiceTypeEntry[];
  clientEligibilityJson: ClientEligibilityEntry[];
  createdAt: Date;
}

export class CreateInspectorUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly auditService: AuditService,
    private readonly serviceRegionRepo?: IServiceRegionRepository,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(input: CreateInspectorInput): Promise<CreateInspectorOutput> {
    const { name, email, phone, paymentSettings, regionIds, serviceTypes, clientEligibility, actor } = input;

    this.authorizationService!.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector.create',
      entityType: 'Inspector',
    });

    const existing = await this.inspectorRepo.findByEmail(email);
    if (existing) {
      throw new InspectorEmailConflictError();
    }

    const now = new Date();
    const id = crypto.randomUUID();

    // Auto-create a User record for inspector authentication (role: INSP, no tenant)
    const userId = crypto.randomUUID();
    const temporaryPassword = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const user = new UserEntity({
      id: userId,
      tenantId: null,
      branchId: null,
      role: 'INSP',
      name,
      email,
      phone: phone ?? null,
      status: 'ACTIVE',
      passwordHash,
      totpSecret: null,
      totpEnabled: false,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.userManagementRepo.save(user);

    const inspector = new InspectorEntity({
      id,
      userId,
      name,
      email,
      phone: phone ?? null,
      status: 'ACTIVE',
      paymentSettingsJson: paymentSettings ?? {},
      serviceTypesJson: serviceTypes ?? [],
      clientEligibilityJson: clientEligibility ?? [],
      blockedClientsJson: (input as any).blockedClients ?? [],
      fullName: (input as any).fullName ?? null,
      address: (input as any).address ?? null,
      abn: (input as any).abn ?? null,
      dateOfBirth: (input as any).dateOfBirth ? new Date((input as any).dateOfBirth) : null,
      insuranceFileKey: (input as any).insuranceFileKey ?? null,
      insuranceExpiresAt: (input as any).insuranceExpiresAt ? new Date((input as any).insuranceExpiresAt) : null,
      policeCheckFileKey: (input as any).policeCheckFileKey ?? null,
      policeCheckExpiresAt: (input as any).policeCheckExpiresAt ? new Date((input as any).policeCheckExpiresAt) : null,
      insuranceMetaJson: null,
      policeCheckMetaJson: null,
      photoStorageKey: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.inspectorRepo.save(inspector);

    // Link inspector to service regions if regionIds provided
    if (regionIds && regionIds.length > 0 && this.serviceRegionRepo) {
      await this.serviceRegionRepo.setInspectorRegions(id, regionIds);
    }

    this.auditService.log({
      action: 'inspector.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: id,
      after: {
        id,
        name,
        email,
        phone: inspector.phone,
        status: 'ACTIVE',
        paymentSettingsJson: inspector.paymentSettingsJson,
        regionIds: regionIds ?? [],
        serviceTypesJson: inspector.serviceTypesJson,
        clientEligibilityJson: inspector.clientEligibilityJson,
      },
    });

    return {
      id: inspector.id,
      userId: inspector.userId!,
      name: inspector.name,
      email: inspector.email,
      phone: inspector.phone,
      status: inspector.status,
      paymentSettingsJson: inspector.paymentSettingsJson,
      regionIds: regionIds ?? [],
      serviceTypesJson: inspector.serviceTypesJson,
      clientEligibilityJson: inspector.clientEligibilityJson,
      createdAt: inspector.createdAt,
    };
  }
}
