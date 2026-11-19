import { randomUUID } from 'node:crypto';
import type {
  AuthContext,
  PresignPropertyFileUploadInput,
  PresignPropertyFileUploadResponse,
} from '@properfy/shared';
import {
  buildPropertyFileStorageKey,
  extensionForMime,
  PROPERTY_FILE_STORAGE_BUCKET,
} from '@properfy/shared';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import { assertTenantScope } from '../../../../shared/domain/require-tenant-scope';
import type { IPropertyFileRepository } from '../../domain/property-file.repository';
import type { IPropertyIssueRepository } from '../../domain/property-issue.repository';
import type { IInspectorAppointmentVisibility } from '../../domain/inspector-appointment-visibility';
import {
  PropertyNotFoundError,
  PropertyFileNotFoundError,
  PropertyFileForbiddenError,
  PropertyFileMimeNotAllowedError,
  PropertyIssueAppointmentMismatchError,
} from '../../domain/property-file.errors';

const UPLOAD_TTL_SECONDS = 900;
const UPLOAD_ACTION = 'property_file.upload';

export interface PresignPropertyFileUploadCommand {
  actor: AuthContext;
  input: PresignPropertyFileUploadInput;
}

export class PresignPropertyFileUploadUseCase {
  constructor(
    private readonly fileRepo: IPropertyFileRepository,
    private readonly issueRepo: IPropertyIssueRepository,
    private readonly visibility: IInspectorAppointmentVisibility,
    private readonly storage: IStorageService,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(
    command: PresignPropertyFileUploadCommand,
  ): Promise<PresignPropertyFileUploadResponse> {
    const { actor, input } = command;
    // CL_USER is excluded here (matrix) — only AM/OP/CL_ADMIN/INSP may upload.
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'INSP'], {
      action: UPLOAD_ACTION,
      entityType: 'PropertyFile',
    });

    const isIssuePhoto = input.type === 'ISSUE';
    const propertyTenantId = await this.fileRepo.findPropertyTenantId(input.propertyId);
    if (!propertyTenantId) throw new PropertyNotFoundError();

    const appointmentId = input.appointmentId ?? null;
    const tenantId = await this.resolveWriteTenant(actor, {
      propertyId: input.propertyId,
      propertyTenantId,
      appointmentId,
      isIssuePhoto,
    });

    // Non-INSP: validate any supplied appointment belongs to this property + tenant (D1).
    if (appointmentId && actor.role !== 'INSP') {
      const scope = await this.issueRepo.findAppointmentScope(appointmentId);
      if (!scope || scope.propertyId !== input.propertyId || scope.tenantId !== tenantId) {
        throw new PropertyIssueAppointmentMismatchError();
      }
    }

    // MIME allow-list (C.A5, presign side).
    const config = await this.platformSettings.get('propertyFiles');
    const allowed = isIssuePhoto ? config.issueImageMimes : config.allowedMimes;
    if (!allowed.includes(input.mime)) throw new PropertyFileMimeNotAllowedError();

    const now = this.clock.now();
    const fileId = randomUUID();
    const ext = extensionForMime(input.mime);
    const storageKey = buildPropertyFileStorageKey({
      tenantId,
      propertyId: input.propertyId,
      fileId,
      ext,
    });
    const { url } = await this.storage.createSignedUploadUrl(
      PROPERTY_FILE_STORAGE_BUCKET,
      storageKey,
      UPLOAD_TTL_SECONDS,
      input.mime,
    );

    await this.fileRepo.create({
      id: fileId,
      tenantId,
      propertyId: input.propertyId,
      appointmentId,
      issueId: null,
      type: input.type,
      versionGroupId: randomUUID(),
      version: 1,
      fileName: input.fileName,
      mime: input.mime,
      sizeBytes: input.sizeBytes ?? 0,
      storageKey,
      status: 'PENDING',
      uploadedByUserId: actor.userId,
      createdAt: now,
    });

    return {
      fileId,
      uploadUrl: url,
      storageKey,
      expiresAt: new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
    };
  }

  private async resolveWriteTenant(
    actor: AuthContext,
    ctx: {
      propertyId: string;
      propertyTenantId: string;
      appointmentId: string | null;
      isIssuePhoto: boolean;
    },
  ): Promise<string> {
    switch (actor.role) {
      case 'AM':
      case 'OP':
        return ctx.propertyTenantId;
      case 'CL_ADMIN': {
        const tenantId = assertTenantScope(actor, UPLOAD_ACTION);
        // Another agency's property must not reveal its existence (C.A2).
        if (ctx.propertyTenantId !== tenantId) throw new PropertyNotFoundError();
        return tenantId;
      }
      case 'INSP': {
        if (!ctx.isIssuePhoto) {
          throw new PropertyFileForbiddenError('Inspectors can only upload issue photos.');
        }
        if (!actor.inspectorId || !ctx.appointmentId) {
          throw new PropertyFileForbiddenError('An appointment is required to upload an issue photo.');
        }
        const vis = await this.visibility.resolveForInspector(ctx.appointmentId, actor.inspectorId);
        if (!vis || vis.propertyId !== ctx.propertyId) throw new PropertyFileNotFoundError();
        return vis.tenantId;
      }
      default:
        throw new PropertyFileForbiddenError();
    }
  }
}
