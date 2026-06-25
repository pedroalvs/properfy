import { randomUUID } from 'crypto';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import { InspectorNotFoundError } from '../../domain/inspector.errors';

const DOCUMENT_BUCKET = 'inspector-documents';
const UPLOAD_TTL_SECONDS = 900; // 15 minutes
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const DOCUMENT_KINDS = ['INSURANCE', 'POLICE_CHECK'] as const;
export type InspectorDocumentKind = typeof DOCUMENT_KINDS[number];

function extForMime(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  };
  return map[mimeType] ?? 'bin';
}

export interface GenerateInspectorDocumentUploadUrlInput {
  inspectorId: string;
  kind: InspectorDocumentKind;
  mimeType: string;
  fileName: string;
  actor: AuthContext;
}

export interface GenerateInspectorDocumentUploadUrlOutput {
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
}

export class GenerateInspectorDocumentUploadUrlUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly storageService: IStorageService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: GenerateInspectorDocumentUploadUrlInput): Promise<GenerateInspectorDocumentUploadUrlOutput> {
    const { inspectorId, kind, mimeType, fileName, actor } = input;

    // AM/OP only
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Only AM or OP can upload inspector documents');
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new ForbiddenError('MIME_TYPE_NOT_ALLOWED', `Allowed MIME types: ${ALLOWED_MIME_TYPES.join(', ')}`);
    }

    if (!DOCUMENT_KINDS.includes(kind)) {
      throw new ForbiddenError('INVALID_DOCUMENT_KIND', `Allowed kinds: ${DOCUMENT_KINDS.join(', ')}`);
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    const ext = extForMime(mimeType);
    const fileId = randomUUID();
    const storageKey = `inspectors/${inspectorId}/documents/${kind.toLowerCase()}/${fileId}.${ext}`;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000);

    const { url } = await this.storageService.createSignedUploadUrl(
      DOCUMENT_BUCKET,
      storageKey,
      UPLOAD_TTL_SECONDS,
      mimeType,
    );

    this.auditService.log({
      action: 'inspector.document_upload_presigned',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      after: { kind, storageKey, mimeType, fileName },
    });

    return { uploadUrl: url, storageKey, expiresAt: expiresAt.toISOString() };
  }
}
