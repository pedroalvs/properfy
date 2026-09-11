import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import {
  InspectorNotFoundError,
  InspectorPhotoInvalidKeyError,
  InspectorPhotoObjectNotFoundError,
} from '../../domain/inspector.errors';

const AVATAR_BUCKET = 'inspector-avatars';
// inspectors/<uuid>/avatar.<ext>
const PHOTO_KEY_REGEX = /^inspectors\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar\.(png|jpg|webp)$/i;

export interface ConfirmInspectorPhotoUploadInput {
  inspectorId: string;
  storageKey: string;
  actor: AuthContext;
}

export interface ConfirmInspectorPhotoUploadOutput {
  inspectorId: string;
}

export class ConfirmInspectorPhotoUploadUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly storageService: IStorageService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ConfirmInspectorPhotoUploadInput): Promise<ConfirmInspectorPhotoUploadOutput> {
    const { inspectorId, storageKey, actor } = input;

    // RBAC: AM/OP can confirm for any inspector; INSP can confirm for themselves only
    if (actor.role === 'AM' || actor.role === 'OP') {
      // Full access
    } else if (actor.role === 'INSP' && actor.inspectorId === inspectorId) {
      // Self only
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to confirm inspector photo');
    }

    if (!PHOTO_KEY_REGEX.test(storageKey)) {
      throw new InspectorPhotoInvalidKeyError();
    }

    // The key format is deterministic (`inspectors/<uuid>/avatar.<ext>`), so a
    // shape-only check would let an AM/OP bind another inspector's object onto
    // this record. Bind the embedded UUID to the request's inspectorId (#288/#320).
    const keyInspectorId = storageKey.split('/')[1];
    if (keyInspectorId?.toLowerCase() !== inspectorId.toLowerCase()) {
      throw new InspectorPhotoInvalidKeyError();
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    const head = await this.storageService.headObject(AVATAR_BUCKET, storageKey);
    if (!head.exists) {
      throw new InspectorPhotoObjectNotFoundError();
    }

    const previousKey = inspector.photoStorageKey;

    await this.inspectorRepo.update(inspectorId, { photoStorageKey: storageKey });

    // #569: the avatar key varies with the MIME extension, so a re-upload as a
    // different type leaves the old object orphaned with a still-valid key. Delete
    // it once the record points at the new key. Best-effort and ordered after the
    // update: the row already references the new object, and S3 DeleteObject is
    // idempotent, so a transient failure self-heals on the next confirm rather
    // than rolling back a successful photo change.
    if (previousKey && previousKey !== storageKey) {
      try {
        await this.storageService.deleteObject(AVATAR_BUCKET, previousKey);
      } catch {
        // Orphan cleanup must never fail an otherwise-successful confirm.
      }
    }

    this.auditService.log({
      action: 'inspector.photo_confirmed',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      before: { photoStorageKey: inspector.photoStorageKey },
      after: { photoStorageKey: storageKey },
    });

    return { inspectorId };
  }
}
