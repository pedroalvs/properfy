import type { PrismaClient } from '@prisma/client';
import { fileTypeFromBuffer } from 'file-type';
import type { PortalIssuePhotoResponse } from '@properfy/shared';
import { PROPERTY_FILE_STORAGE_BUCKET, parsePortalIssueStorageKey } from '@properfy/shared';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IPropertyFileRepository } from '../../../property-file/domain/property-file.repository';
import type { IPropertyIssueRepository } from '../../../property-file/domain/property-issue.repository';
import { isDetectedMimeCompatible } from '../../../property-file/domain/mime-compatibility';
import type { PropertyFileEntity } from '../../../property-file/domain/property-file.entity';
import {
  PropertyNotFoundError,
  PropertyFileNotFoundError,
  PropertyFileObjectMissingError,
  PropertyFileTooLargeError,
  PropertyFileContentMismatchError,
  PropertyFileIdempotencyKeyMissingError,
  PropertyFileIdempotencyMismatchError,
} from '../../../property-file/domain/property-file.errors';
import { toPortalIssuePhotoResponse } from '../portal-issue-mappers';

const SCOPE = 'portal.property-file.confirm';
const TTL_HOURS = 24;
// file-type needs ~4 KB; fetch a little more to cover container formats.
const SNIFF_BYTES = 16 * 1024;

export interface ConfirmPortalIssuePhotoCommand {
  /** The appointment pinned by the portal token (never client input). */
  appointmentId: string;
  fileId: string;
  idempotencyKey: string | undefined;
}

/**
 * Portal confirm for a rental-tenant issue photo (F10-4). Validates the object
 * really landed (size + magic bytes) and belongs to this token's appointment,
 * then keeps it PENDING (it flips to READY only when the issue is created — D20).
 */
export class ConfirmPortalIssuePhotoUseCase {
  constructor(
    private readonly prisma: PrismaClient | undefined,
    private readonly fileRepo: IPropertyFileRepository,
    private readonly issueRepo: IPropertyIssueRepository,
    private readonly storage: IStorageService,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: ConfirmPortalIssuePhotoCommand): Promise<PortalIssuePhotoResponse> {
    const { appointmentId, fileId, idempotencyKey } = command;
    if (!idempotencyKey) throw new PropertyFileIdempotencyKeyMissingError();

    const scope = await this.issueRepo.findAppointmentScope(appointmentId);
    if (!scope) throw new PropertyNotFoundError();
    const tenantId = scope.tenantId;

    // Bind the idempotency cache to the token's appointment so a replayed key
    // cannot cross appointments (the key is a client-chosen value).
    const payloadHash = hashIdempotencyPayload({ fileId, _appointmentId: appointmentId });
    const cached = await this.idempotency.getWithHash<PortalIssuePhotoResponse>(idempotencyKey, SCOPE);
    if (cached) {
      if (cached.payloadHash !== payloadHash) throw new PropertyFileIdempotencyMismatchError();
      return cached.response;
    }

    // Load + scope-check + storage validation OUTSIDE the transaction.
    const file = await this.fileRepo.findById(fileId);
    this.assertFileBelongsToToken(file, appointmentId, tenantId);
    // Narrowed by the assertion above.
    const owned = file as PropertyFileEntity;
    if (owned.status === 'READY') return toPortalIssuePhotoResponse(owned);

    const head = await this.storage.headObject(PROPERTY_FILE_STORAGE_BUCKET, owned.storageKey);
    if (!head.exists) throw new PropertyFileObjectMissingError();

    const config = await this.platformSettings.get('propertyFiles');
    const maxBytes = config.maxFileSizeMb * 1024 * 1024;
    if (head.sizeBytes > maxBytes) throw new PropertyFileTooLargeError(config.maxFileSizeMb);

    const prefix = await this.storage.getObjectBytes(
      PROPERTY_FILE_STORAGE_BUCKET,
      owned.storageKey,
      SNIFF_BYTES,
    );
    const detected = await fileTypeFromBuffer(prefix);
    if (!isDetectedMimeCompatible(owned.mime, detected?.mime)) {
      throw new PropertyFileContentMismatchError();
    }

    const now = this.clock.now();

    return runInTransaction(this.prisma, async ({ tx }) => {
      const reread = await this.idempotency.getWithHash<PortalIssuePhotoResponse>(
        idempotencyKey,
        SCOPE,
        tx,
      );
      if (reread) {
        if (reread.payloadHash !== payloadHash) throw new PropertyFileIdempotencyMismatchError();
        return reread.response;
      }

      const fresh = await this.fileRepo.findById(fileId, tx);
      this.assertFileBelongsToToken(fresh, appointmentId, tenantId);
      const freshOwned = fresh as PropertyFileEntity;
      if (freshOwned.status === 'READY') {
        const already = toPortalIssuePhotoResponse(freshOwned);
        await this.idempotency.set(idempotencyKey, SCOPE, already, TTL_HOURS, payloadHash, tx);
        return already;
      }

      // An issue photo stays PENDING until its issue is created (D20, setReady=false).
      await this.fileRepo.confirmUpload(freshOwned.id, head.sizeBytes, false, now, tx);
      const output = toPortalIssuePhotoResponse({
        ...freshOwned,
        sizeBytes: head.sizeBytes,
        status: 'PENDING',
      });
      await this.idempotency.set(idempotencyKey, SCOPE, output, TTL_HOURS, payloadHash, tx);
      return output;
    });
  }

  /**
   * A file is accepted only when it is this token's appointment's own PENDING/READY
   * ISSUE photo AND its storage key encodes the same tenant+appointment (D25).
   * Any mismatch is a 404 — never reveal that the file exists (C.A2).
   */
  private assertFileBelongsToToken(
    file: PropertyFileEntity | null,
    appointmentId: string,
    tenantId: string,
  ): void {
    if (
      !file ||
      file.deletedAt ||
      file.purgedAt ||
      file.type !== 'ISSUE' ||
      file.appointmentId !== appointmentId ||
      file.tenantId !== tenantId
    ) {
      throw new PropertyFileNotFoundError();
    }
    const parsed = parsePortalIssueStorageKey(file.storageKey);
    if (!parsed || parsed.tenantId !== tenantId || parsed.appointmentId !== appointmentId) {
      throw new PropertyFileNotFoundError();
    }
  }
}
