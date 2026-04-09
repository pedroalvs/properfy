import type { AuthContext } from '@properfy/shared';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IInspectionAssetRepository } from '../../domain/inspection-asset.repository';
import type { IIdempotencyService } from '../../domain/idempotency.service';
import type { IServiceTypeReader } from '../../domain/service-type-reader';
import type { ExecuteStatusTransitionUseCase } from '../../../appointment/application/use-cases/execute-status-transition.use-case';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionNotStartedError,
  ExecutionAlreadyFinishedError,
  ExecutionAssetUploadPendingError,
  ExecutionInsufficientAssetsError,
  ExecutionEmptyChecklistError,
} from '../../domain/inspection-execution.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface FinishInspectionInput {
  appointmentId: string;
  latitude: number;
  longitude: number;
  checklistJson?: Record<string, unknown>;
  notes?: string;
  assets?: Array<{ assetId: string; storageKey: string }>;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface FinishInspectionOutput {
  executionId: string;
  appointmentId: string;
  startedAt: string;
  finishedAt: string;
  appointmentStatus: string;
  assetsCount: number;
}

export class FinishInspectionUseCase {
  constructor(
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly assetRepo: IInspectionAssetRepository,
    private readonly idempotencyService: IIdempotencyService,
    private readonly executeStatusTransition: ExecuteStatusTransitionUseCase,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly serviceTypeReader?: IServiceTypeReader,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(input: FinishInspectionInput): Promise<FinishInspectionOutput> {
    const {
      appointmentId,
      latitude,
      longitude,
      checklistJson,
      notes,
      assets: assetRefs = [],
      idempotencyKey,
      actor,
    } = input;

    // 1. INSP only
    this.authorizationService!.assertRoles(actor, ['INSP'], {
      action: 'appointment.mark_done',
      entityType: 'InspectionExecution',
    });

    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }

    // 2. Check idempotency
    const cached = await this.idempotencyService.get<FinishInspectionOutput>(
      idempotencyKey,
      'finish',
    );
    if (cached) return cached;

    // 3. Load execution
    const execution = await this.executionRepo.findByAppointmentId(appointmentId);
    if (!execution) throw new ExecutionNotStartedError();

    if (execution.inspectorId !== actor.inspectorId) {
      throw new ForbiddenError('FORBIDDEN', 'Inspection execution is not assigned to this inspector');
    }

    // 4. Check not finished
    if (execution.isFinished()) throw new ExecutionAlreadyFinishedError();

    const appointmentResult = await this.appointmentRepo.findById(appointmentId, null);
    if (!appointmentResult) {
      throw new ExecutionAppointmentNotFoundError();
    }
    const { appointment } = appointmentResult;

    // 5a. Validate checklist has at least one response if provided
    if (checklistJson !== undefined && checklistJson !== null) {
      if (Object.keys(checklistJson).length === 0) {
        throw new ExecutionEmptyChecklistError();
      }
    }

    // 5. Validate minimum assets (configurable per service type, default: 1 PHOTO)
    const uploadedAssets = await this.assetRepo.findUploadedByExecutionId(execution.id);

    // Resolve asset requirements from service type checklist config if available.
    // Falls back to default (1 PHOTO, no signature) when checklistTemplate is not
    // yet defined on the service type — will be extended post-launch (M5).
    let minPhotos = 1;
    let requiresSignature = false;
    const serviceTypeId = appointment.serviceTypeId;
    if (this.serviceTypeReader && serviceTypeId) {
      const svcType = await this.serviceTypeReader.findById(serviceTypeId);
      const checklist = (svcType as Record<string, unknown> | null)?.checklistTemplate as
        | { minPhotos?: number; requiresSignature?: boolean }
        | undefined;
      if (checklist) {
        minPhotos = typeof checklist.minPhotos === 'number' ? checklist.minPhotos : 1;
        requiresSignature = checklist.requiresSignature === true;
      }
    }

    const photos = uploadedAssets.filter((a) => a.kind === 'PHOTO');
    if (photos.length < minPhotos) throw new ExecutionInsufficientAssetsError();
    if (requiresSignature) {
      const hasSignature = uploadedAssets.some((a) => a.kind === 'SIGNATURE');
      if (!hasSignature) throw new ExecutionInsufficientAssetsError();
    }

    // 6. Validate referenced assets are all UPLOADED
    for (const ref of assetRefs) {
      const asset = await this.assetRepo.findById(ref.assetId);
      if (!asset || asset.inspectionExecutionId !== execution.id) {
        throw new ExecutionAssetUploadPendingError();
      }
      if (!asset.isUploaded()) {
        throw new ExecutionAssetUploadPendingError();
      }
    }

    // 7. Update execution
    const now = new Date();
    await this.executionRepo.update(execution.id, {
      finishedAt: now,
      finishLatitude: latitude,
      finishLongitude: longitude,
      checklistJson: checklistJson ?? null,
      notes: notes ?? null,
    });

    // 8. Trigger SCHEDULED -> DONE transition
    const transitionResult = await this.executeStatusTransition.execute({
      appointmentId,
      targetStatus: 'DONE',
      actor,
    });

    // 9. Audit log
    this.auditService.log({
      action: 'inspection_execution.finished',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectionExecution',
      entityId: execution.id,
      tenantId: appointment.tenantId,
      after: {
        appointmentId,
        finishLatitude: latitude,
        finishLongitude: longitude,
        assetsCount: uploadedAssets.length,
      },
    });

    // 9b. Audit log for appointment timeline
    this.auditService.log({
      action: 'inspection.finished',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      metadata: { latitude, longitude },
    });

    // 10. Store idempotency
    const output: FinishInspectionOutput = {
      executionId: execution.id,
      appointmentId,
      startedAt: execution.startedAt.toISOString(),
      finishedAt: now.toISOString(),
      appointmentStatus: transitionResult.status,
      assetsCount: uploadedAssets.length,
    };

    await this.idempotencyService.set(idempotencyKey, 'finish', output, 24);

    return output;
  }
}
