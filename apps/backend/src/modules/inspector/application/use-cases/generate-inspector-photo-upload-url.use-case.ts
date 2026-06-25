import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import { InspectorNotFoundError } from '../../domain/inspector.errors';

const AVATAR_BUCKET = 'inspector-avatars';
const UPLOAD_TTL_SECONDS = 900; // 15 minutes
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function extForMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };
  return map[mimeType] ?? 'bin';
}

export interface GenerateInspectorPhotoUploadUrlInput {
  inspectorId: string;
  mimeType: string;
  actor: AuthContext;
}

export interface GenerateInspectorPhotoUploadUrlOutput {
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
}

export class GenerateInspectorPhotoUploadUrlUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly storageService: IStorageService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: GenerateInspectorPhotoUploadUrlInput): Promise<GenerateInspectorPhotoUploadUrlOutput> {
    const { inspectorId, mimeType, actor } = input;

    // RBAC: AM/OP can upload for any inspector; INSP can upload for themselves only
    if (actor.role === 'AM' || actor.role === 'OP') {
      // Full access
    } else if (actor.role === 'INSP' && actor.inspectorId === inspectorId) {
      // Self only
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to upload inspector photo');
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new ForbiddenError('MIME_TYPE_NOT_ALLOWED', `Allowed MIME types: ${ALLOWED_MIME_TYPES.join(', ')}`);
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    const ext = extForMime(mimeType);
    // One avatar per inspector — fixed key, not UUID, so upload replaces previous
    const storageKey = `inspectors/${inspectorId}/avatar.${ext}`;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000);

    const { url } = await this.storageService.createSignedUploadUrl(
      AVATAR_BUCKET,
      storageKey,
      UPLOAD_TTL_SECONDS,
      mimeType,
    );

    this.auditService.log({
      action: 'inspector.photo_upload_presigned',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      after: { storageKey, mimeType },
    });

    return { uploadUrl: url, storageKey, expiresAt: expiresAt.toISOString() };
  }
}
