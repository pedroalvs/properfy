import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IInspectionAssetRepository } from '../../domain/inspection-asset.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { ExecutionAppointmentNotFoundError } from '../../domain/inspection-execution.errors';

export interface AppointmentAssetItem {
  id: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number | null;
  kind: string;
  status: string;
  originalFilename: string | null;
  createdAt: string;
}

export interface ListAppointmentAssetsOutput {
  data: AppointmentAssetItem[];
}

export class ListAppointmentAssetsUseCase {
  constructor(
    private readonly assetRepo: IInspectionAssetRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(
    appointmentId: string,
    actor: AuthContext,
  ): Promise<ListAppointmentAssetsOutput> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'appointment.view_evidence',
      entityType: 'InspectionAsset',
    });

    const result = await this.appointmentRepo.findById(appointmentId, actor.tenantId);
    if (!result) {
      throw new ExecutionAppointmentNotFoundError();
    }

    const assets = await this.assetRepo.findUploadedByAppointmentId(appointmentId);

    return {
      data: assets.map((a) => ({
        id: a.id,
        storageKey: a.storageKey,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        kind: a.kind,
        status: a.status,
        originalFilename: a.originalFilename,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
}
