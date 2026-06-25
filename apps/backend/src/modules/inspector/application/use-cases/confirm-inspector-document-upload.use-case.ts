import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import {
  InspectorNotFoundError,
  InspectorDocumentInvalidKeyError,
  InspectorDocumentObjectNotFoundError,
} from '../../domain/inspector.errors';
import type { InspectorDocumentKind } from './generate-inspector-document-upload-url.use-case';

const DOCUMENT_BUCKET = 'inspector-documents';
// inspectors/<uuid>/documents/<kind>/<uuid>.<ext>
const DOC_KEY_REGEX = /^inspectors\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/documents\/(insurance|police_check)\/[0-9a-f-]{36}\.(pdf|jpg|png)$/i;

export interface ConfirmInspectorDocumentUploadInput {
  inspectorId: string;
  kind: InspectorDocumentKind;
  storageKey: string;
  fileName: string;
  actor: AuthContext;
}

export interface ConfirmInspectorDocumentUploadOutput {
  inspectorId: string;
}

export class ConfirmInspectorDocumentUploadUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly storageService: IStorageService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ConfirmInspectorDocumentUploadInput): Promise<ConfirmInspectorDocumentUploadOutput> {
    const { inspectorId, kind, storageKey, fileName, actor } = input;

    // AM/OP only
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Only AM or OP can confirm inspector documents');
    }

    if (!DOC_KEY_REGEX.test(storageKey)) {
      throw new InspectorDocumentInvalidKeyError();
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    const head = await this.storageService.headObject(DOCUMENT_BUCKET, storageKey);
    if (!head.exists) {
      throw new InspectorDocumentObjectNotFoundError();
    }

    const metaJson = {
      fileKey: storageKey,
      fileName,
      sizeBytes: head.sizeBytes,
      uploadedAt: new Date().toISOString(),
      uploadedBy: actor.userId,
    };

    const updateData =
      kind === 'INSURANCE'
        ? { insuranceMetaJson: metaJson }
        : { policeCheckMetaJson: metaJson };

    await this.inspectorRepo.update(inspectorId, updateData);

    this.auditService.log({
      action: `inspector.document_confirmed`,
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      after: { kind, storageKey, fileName },
    });

    return { inspectorId };
  }
}
