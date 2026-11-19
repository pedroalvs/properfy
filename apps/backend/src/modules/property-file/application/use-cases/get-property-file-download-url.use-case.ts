import type { AuthContext, PropertyFileDownloadResponse } from '@properfy/shared';
import { PROPERTY_FILE_STORAGE_BUCKET } from '@properfy/shared';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IPropertyFileRepository } from '../../domain/property-file.repository';
import type { PropertyScopeService } from '../property-scope.service';
import { PropertyFileNotFoundError } from '../../domain/property-file.errors';

const DOWNLOAD_TTL_SECONDS = 300; // 5 minutes

export interface GetPropertyFileDownloadUrlCommand {
  actor: AuthContext;
  fileId: string;
}

export class GetPropertyFileDownloadUrlUseCase {
  constructor(
    private readonly fileRepo: IPropertyFileRepository,
    private readonly storage: IStorageService,
    private readonly scope: PropertyScopeService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: GetPropertyFileDownloadUrlCommand): Promise<PropertyFileDownloadResponse> {
    const { actor, fileId } = command;
    const file = await this.fileRepo.findById(fileId);
    // A purged file's object is gone — treat as not found (never a broken URL).
    if (!file || file.deletedAt || file.purgedAt || file.status !== 'READY') {
      throw new PropertyFileNotFoundError();
    }
    await this.scope.assertCanReadFile(actor, file);

    const url = await this.storage.createSignedDownloadUrl(
      PROPERTY_FILE_STORAGE_BUCKET,
      file.storageKey,
      DOWNLOAD_TTL_SECONDS,
    );
    return {
      url,
      expiresAt: new Date(this.clock.now().getTime() + DOWNLOAD_TTL_SECONDS * 1000).toISOString(),
    };
  }
}
