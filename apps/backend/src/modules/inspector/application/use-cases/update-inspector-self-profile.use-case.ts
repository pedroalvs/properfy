import type { AuthContext, PaymentSettings } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import { InspectorNotFoundError } from '../../domain/inspector.errors';

export interface UpdateInspectorSelfProfileInput {
  inspectorId: string;
  data: {
    phone?: string | null;
    fullName?: string | null;
    paymentSettings?: PaymentSettings;
  };
  actor: AuthContext;
}

export interface UpdateInspectorSelfProfileOutput {
  inspectorId: string;
}

export class UpdateInspectorSelfProfileUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateInspectorSelfProfileInput): Promise<UpdateInspectorSelfProfileOutput> {
    const { inspectorId, data, actor } = input;

    // INSP only, self only
    if (actor.role !== 'INSP' || actor.inspectorId !== inspectorId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Inspectors can only update their own profile');
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    const before = {
      phone: inspector.phone,
      fullName: inspector.fullName,
      paymentSettingsJson: inspector.paymentSettingsJson,
    };

    const updateData: Parameters<IInspectorRepository['update']>[1] = {};
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.paymentSettings !== undefined) updateData.paymentSettingsJson = data.paymentSettings;

    await this.inspectorRepo.update(inspectorId, updateData);

    this.auditService.log({
      action: 'inspector.self_profile_updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      before,
      after: {
        phone: data.phone ?? inspector.phone,
        fullName: data.fullName ?? inspector.fullName,
        paymentSettingsJson: data.paymentSettings ?? inspector.paymentSettingsJson,
      },
    });

    return { inspectorId };
  }
}
