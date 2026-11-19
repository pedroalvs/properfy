import { randomUUID } from 'node:crypto';
import type {
  PortalPresignIssuePhotoInput,
  PortalPresignIssuePhotoResponse,
} from '@properfy/shared';
import {
  buildPortalIssueStorageKey,
  extensionForMime,
  PROPERTY_FILE_STORAGE_BUCKET,
} from '@properfy/shared';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IPropertyFileRepository } from '../../../property-file/domain/property-file.repository';
import type { IPropertyIssueRepository } from '../../../property-file/domain/property-issue.repository';
import {
  PropertyNotFoundError,
  PropertyFileMimeNotAllowedError,
} from '../../../property-file/domain/property-file.errors';
import { PortalIssueNoPropertyError } from '../../domain/rental-tenant-portal.errors';

const UPLOAD_TTL_SECONDS = 900;

export interface PresignPortalIssuePhotoCommand {
  /** The appointment pinned by the portal token (never client input). */
  appointmentId: string;
  input: PortalPresignIssuePhotoInput;
}

/**
 * Portal presign for a rental-tenant issue photo (F10-4). Scope is resolved from
 * the token's appointment; the file is always a PENDING `ISSUE` photo with no
 * uploader. The response omits `storageKey` (it embeds the agency `tenantId`).
 */
export class PresignPortalIssuePhotoUseCase {
  constructor(
    private readonly fileRepo: IPropertyFileRepository,
    private readonly issueRepo: IPropertyIssueRepository,
    private readonly storage: IStorageService,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(
    command: PresignPortalIssuePhotoCommand,
  ): Promise<PortalPresignIssuePhotoResponse> {
    const { appointmentId, input } = command;

    const scope = await this.issueRepo.findAppointmentScope(appointmentId);
    if (!scope) throw new PropertyNotFoundError();
    if (!scope.propertyId) throw new PortalIssueNoPropertyError();
    const { propertyId, tenantId } = scope;

    // Issue photos are constrained to the image allow-list (C.A5, presign side).
    const config = await this.platformSettings.get('propertyFiles');
    if (!config.issueImageMimes.includes(input.mime)) {
      throw new PropertyFileMimeNotAllowedError();
    }

    const now = this.clock.now();
    const fileId = randomUUID();
    const ext = extensionForMime(input.mime);
    const storageKey = buildPortalIssueStorageKey({ tenantId, appointmentId, fileId, ext });
    const { url } = await this.storage.createSignedUploadUrl(
      PROPERTY_FILE_STORAGE_BUCKET,
      storageKey,
      UPLOAD_TTL_SECONDS,
      input.mime,
    );

    await this.fileRepo.create({
      id: fileId,
      tenantId,
      propertyId,
      appointmentId,
      issueId: null,
      type: 'ISSUE',
      versionGroupId: randomUUID(),
      version: 1,
      fileName: input.fileName,
      mime: input.mime,
      sizeBytes: input.sizeBytes ?? 0,
      storageKey,
      status: 'PENDING',
      uploadedByUserId: null,
      createdAt: now,
    });

    return {
      fileId,
      uploadUrl: url,
      expiresAt: new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
    };
  }
}
