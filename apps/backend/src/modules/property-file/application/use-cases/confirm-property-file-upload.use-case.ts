import type { PrismaClient } from '@prisma/client';
import { fileTypeFromBuffer } from 'file-type';
import type { AuthContext, PropertyFileResponse } from '@properfy/shared';
import { PROPERTY_FILE_STORAGE_BUCKET } from '@properfy/shared';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IPropertyFileRepository } from '../../domain/property-file.repository';
import type { PropertyScopeService } from '../property-scope.service';
import { isDetectedMimeCompatible } from '../../domain/mime-compatibility';
import { toPropertyFileResponse } from '../mappers';
import {
  PropertyFileNotFoundError,
  PropertyFileObjectMissingError,
  PropertyFileTooLargeError,
  PropertyFileContentMismatchError,
  PropertyFileIdempotencyKeyMissingError,
  PropertyFileIdempotencyMismatchError,
} from '../../domain/property-file.errors';

const SCOPE = 'property-file.confirm';
const TTL_HOURS = 24;
// file-type needs ~4 KB; fetch a little more to cover container formats.
const SNIFF_BYTES = 16 * 1024;

export interface ConfirmPropertyFileUploadCommand {
  actor: AuthContext;
  fileId: string;
  idempotencyKey: string | undefined;
  requestId?: string;
}

export class ConfirmPropertyFileUploadUseCase {
  constructor(
    private readonly prisma: PrismaClient | undefined,
    private readonly fileRepo: IPropertyFileRepository,
    private readonly storage: IStorageService,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly scope: PropertyScopeService,
    private readonly idempotency: IIdempotencyService,
    private readonly audit: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: ConfirmPropertyFileUploadCommand): Promise<PropertyFileResponse> {
    const { actor, fileId, idempotencyKey, requestId } = command;
    if (!idempotencyKey) throw new PropertyFileIdempotencyKeyMissingError();

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'INSP'], {
      action: 'property_file.upload',
      entityType: 'PropertyFile',
    });

    const payloadHash = hashIdempotencyPayload({ fileId });
    const cached = await this.idempotency.getWithHash<PropertyFileResponse>(idempotencyKey, SCOPE);
    if (cached) {
      if (cached.payloadHash !== payloadHash) throw new PropertyFileIdempotencyMismatchError();
      return cached.response;
    }

    // Load + scope-check + storage validation OUTSIDE the transaction (no S3 I/O
    // while holding a DB connection).
    const file = await this.fileRepo.findById(fileId);
    if (!file || file.deletedAt || file.purgedAt) throw new PropertyFileNotFoundError();
    await this.scope.assertCanReadFile(actor, file);
    if (file.status === 'READY') return toPropertyFileResponse(file);

    const head = await this.storage.headObject(PROPERTY_FILE_STORAGE_BUCKET, file.storageKey);
    if (!head.exists) throw new PropertyFileObjectMissingError();

    const config = await this.platformSettings.get('propertyFiles');
    const maxBytes = config.maxFileSizeMb * 1024 * 1024;
    if (head.sizeBytes > maxBytes) throw new PropertyFileTooLargeError(config.maxFileSizeMb);

    const prefix = await this.storage.getObjectBytes(
      PROPERTY_FILE_STORAGE_BUCKET,
      file.storageKey,
      SNIFF_BYTES,
    );
    const detected = await fileTypeFromBuffer(prefix);
    if (!isDetectedMimeCompatible(file.mime, detected?.mime)) {
      throw new PropertyFileContentMismatchError();
    }

    // A new issue photo (type ISSUE, no issue yet) stays PENDING until its issue
    // is created (D20); everything else flips to READY now.
    const setReady = !(file.type === 'ISSUE' && file.issueId === null);
    const now = this.clock.now();

    return runInTransaction(this.prisma, async ({ tx, defer }) => {
      const reread = await this.idempotency.getWithHash<PropertyFileResponse>(
        idempotencyKey,
        SCOPE,
        tx,
      );
      if (reread) {
        if (reread.payloadHash !== payloadHash) throw new PropertyFileIdempotencyMismatchError();
        return reread.response;
      }

      const fresh = await this.fileRepo.findById(fileId, tx);
      if (!fresh || fresh.deletedAt || fresh.purgedAt) throw new PropertyFileNotFoundError();
      if (fresh.status === 'READY') {
        const already = toPropertyFileResponse(fresh);
        await this.idempotency.set(idempotencyKey, SCOPE, already, TTL_HOURS, payloadHash, tx);
        return already;
      }

      await this.fileRepo.confirmUpload(fresh.id, head.sizeBytes, setReady, now, tx);
      const output = toPropertyFileResponse({
        ...fresh,
        sizeBytes: head.sizeBytes,
        status: setReady ? 'READY' : 'PENDING',
      });
      await this.idempotency.set(idempotencyKey, SCOPE, output, TTL_HOURS, payloadHash, tx);

      if (setReady) {
        defer(async () => {
          this.audit.log({
            action: 'property_file.uploaded',
            actorType: 'USER',
            actorId: actor.userId,
            entityType: 'PropertyFile',
            entityId: fresh.id,
            tenantId: fresh.tenantId,
            after: {
              type: fresh.type,
              version: fresh.version,
              fileName: fresh.fileName,
              mime: fresh.mime,
              sizeBytes: head.sizeBytes,
              appointmentId: fresh.appointmentId,
            },
            requestId,
          });
        });
      }

      return output;
    });
  }
}
