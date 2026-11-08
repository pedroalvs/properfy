import { PROPERTY_FILE_STORAGE_BUCKET } from '@properfy/shared';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IPropertyFileRepository } from '../../domain/property-file.repository';
import type { PurgeableFile } from '../../domain/property-file.entity';

const BATCH_SIZE = 200;
const MAX_BATCHES_PER_STEP = 50; // bound a single daily run (~10k rows/step)
const PENDING_ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PropertyFileRetentionResult {
  deletedPurged: number;
  activePurged: number;
  orphansPurged: number;
}

/**
 * Daily retention sweep (D8/D22/D27). Three steps, each purging the storage
 * object, stamping `purged_at` and auditing `property_file.purged`:
 * 1. soft-deleted READY files past `deletedRetentionDays`.
 * 2. active READY files past `retentionDays` (when configured).
 * 3. PENDING orphans older than 24 h (also soft-deleted).
 * A failure on one row is logged and never aborts the batch.
 */
export class PropertyFileRetentionWorker {
  constructor(
    private readonly fileRepo: IPropertyFileRepository,
    private readonly storage: IStorageService,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly audit: AuditService,
    private readonly logger: Logger,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(): Promise<PropertyFileRetentionResult> {
    const config = await this.platformSettings.get('propertyFiles');
    const now = this.clock.now();

    const deletedBefore = new Date(now.getTime() - config.deletedRetentionDays * DAY_MS);
    const deletedPurged = await this.runStep(
      'deleted_retention',
      (limit) => this.fileRepo.findDeletedToPurge(deletedBefore, limit),
      false,
      now,
    );

    let activePurged = 0;
    if (config.retentionDays != null) {
      const activeBefore = new Date(now.getTime() - config.retentionDays * DAY_MS);
      activePurged = await this.runStep(
        'active_retention',
        (limit) => this.fileRepo.findActiveToPurge(activeBefore, limit),
        false,
        now,
      );
    }

    const orphanBefore = new Date(now.getTime() - PENDING_ORPHAN_MAX_AGE_MS);
    const orphansPurged = await this.runStep(
      'pending_orphan',
      (limit) => this.fileRepo.findPendingOrphansToPurge(orphanBefore, limit),
      true,
      now,
    );

    this.logger.info(
      { deletedPurged, activePurged, orphansPurged },
      'property_file.retention_completed',
    );
    return { deletedPurged, activePurged, orphansPurged };
  }

  private async runStep(
    reason: string,
    find: (limit: number) => Promise<PurgeableFile[]>,
    softDelete: boolean,
    now: Date,
  ): Promise<number> {
    let purged = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_STEP; batch++) {
      const files = await find(BATCH_SIZE);
      if (files.length === 0) break;
      for (const file of files) {
        try {
          // S3 delete is idempotent — a missing object does not throw.
          await this.storage.deleteObject(PROPERTY_FILE_STORAGE_BUCKET, file.storageKey);
          await this.fileRepo.markPurged(file.id, now, { softDelete });
          this.audit.log({
            action: 'property_file.purged',
            actorType: 'SYSTEM',
            entityType: 'PropertyFile',
            entityId: file.id,
            metadata: { reason },
          });
          purged++;
        } catch (error) {
          this.logger.error(
            { err: error, fileId: file.id, reason },
            'property_file.purge_failed',
          );
        }
      }
      if (files.length < BATCH_SIZE) break;
    }
    return purged;
  }
}
