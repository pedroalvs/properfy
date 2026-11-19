import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  AuthContext,
  AddPropertyFileVersionInput,
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
import type { IPropertyFileRepository } from '../../domain/property-file.repository';
import type { PropertyScopeService } from '../property-scope.service';
import {
  PropertyFileNotFoundError,
  PropertyFileMimeNotAllowedError,
} from '../../domain/property-file.errors';

const UPLOAD_TTL_SECONDS = 900;
const MAX_VERSION_RETRIES = 5;

/** A unique-constraint violation on (version_group_id, version): Prisma P2002 or raw 23505. */
function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2002';
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '23505'
  );
}

export interface AddPropertyFileVersionCommand {
  actor: AuthContext;
  sourceFileId: string;
  input: AddPropertyFileVersionInput;
}

export class AddPropertyFileVersionUseCase {
  constructor(
    private readonly fileRepo: IPropertyFileRepository,
    private readonly storage: IStorageService,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly scope: PropertyScopeService,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: AddPropertyFileVersionCommand): Promise<PresignPropertyFileUploadResponse> {
    const { actor, sourceFileId, input } = command;
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'property_file.version',
      entityType: 'PropertyFile',
    });

    const source = await this.fileRepo.findById(sourceFileId);
    if (!source || source.deletedAt || source.purgedAt) throw new PropertyFileNotFoundError();
    await this.scope.assertCanReadFile(actor, source);

    const config = await this.platformSettings.get('propertyFiles');
    const allowed = source.type === 'ISSUE' ? config.issueImageMimes : config.allowedMimes;
    if (!allowed.includes(input.mime)) throw new PropertyFileMimeNotAllowedError();

    const now = this.clock.now();
    const fileId = randomUUID();
    const ext = extensionForMime(input.mime);
    // The key uses the fresh fileId, so it is stable across version retries.
    const storageKey = buildPropertyFileStorageKey({
      tenantId: source.tenantId,
      propertyId: source.propertyId,
      fileId,
      ext,
    });
    const { url } = await this.storage.createSignedUploadUrl(
      PROPERTY_FILE_STORAGE_BUCKET,
      storageKey,
      UPLOAD_TTL_SECONDS,
      input.mime,
    );

    for (let attempt = 0; ; attempt++) {
      const nextVersion = (await this.fileRepo.maxVersion(source.versionGroupId)) + 1;
      try {
        await this.fileRepo.create({
          id: fileId,
          tenantId: source.tenantId,
          propertyId: source.propertyId,
          appointmentId: source.appointmentId,
          issueId: source.issueId,
          type: source.type,
          versionGroupId: source.versionGroupId,
          version: nextVersion,
          fileName: input.fileName,
          mime: input.mime,
          sizeBytes: input.sizeBytes ?? 0,
          storageKey,
          status: 'PENDING',
          uploadedByUserId: actor.userId,
          createdAt: now,
        });
        break;
      } catch (error) {
        // Two concurrent versions raced for the same number — recompute and retry.
        if (isUniqueViolation(error) && attempt < MAX_VERSION_RETRIES) continue;
        throw error;
      }
    }

    return {
      fileId,
      uploadUrl: url,
      storageKey,
      expiresAt: new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
    };
  }
}
