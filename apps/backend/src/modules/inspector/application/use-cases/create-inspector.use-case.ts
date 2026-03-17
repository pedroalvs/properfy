import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import { InspectorEntity } from '../../domain/inspector.entity';
import { InspectorEmailConflictError } from '../../domain/inspector.errors';

export interface CreateInspectorInput {
  name: string;
  email: string;
  phone?: string | null;
  paymentSettings?: Record<string, unknown>;
  regions?: string[];
  serviceTypes?: string[];
  clientEligibility?: string[];
  actor: AuthContext;
}

export interface CreateInspectorOutput {
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
}

export class CreateInspectorUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateInspectorInput): Promise<CreateInspectorOutput> {
    const { name, email, phone, paymentSettings, regions, serviceTypes, clientEligibility, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const existing = await this.inspectorRepo.findByEmail(email);
    if (existing) {
      throw new InspectorEmailConflictError();
    }

    const now = new Date();
    const id = crypto.randomUUID();

    const inspector = new InspectorEntity({
      id,
      userId: null,
      name,
      email,
      phone: phone ?? null,
      status: 'ACTIVE',
      paymentSettingsJson: paymentSettings ?? {},
      regionsJson: regions ?? [],
      serviceTypesJson: serviceTypes ?? [],
      clientEligibilityJson: clientEligibility ?? [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.inspectorRepo.save(inspector);

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
        regionsJson: inspector.regionsJson,
        serviceTypesJson: inspector.serviceTypesJson,
        clientEligibilityJson: inspector.clientEligibilityJson,
      },
    });

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
    };
  }
}
