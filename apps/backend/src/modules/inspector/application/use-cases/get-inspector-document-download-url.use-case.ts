import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import { InspectorNotFoundError } from '../../domain/inspector.errors';
import type { InspectorDocumentKind } from './generate-inspector-document-upload-url.use-case';

const DOCUMENT_BUCKET = 'inspector-documents';
const DOWNLOAD_TTL_SECONDS = 300; // 5 minutes

export interface GetInspectorDocumentDownloadUrlInput {
  inspectorId: string;
  kind: InspectorDocumentKind;
  actor: AuthContext;
}

export interface GetInspectorDocumentDownloadUrlOutput {
  downloadUrl: string;
  fileName: string | null;
}

export class GetInspectorDocumentDownloadUrlUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly storageService: IStorageService,
  ) {}

  async execute(input: GetInspectorDocumentDownloadUrlInput): Promise<GetInspectorDocumentDownloadUrlOutput> {
    const { inspectorId, kind, actor } = input;

    // AM/OP can access any; INSP can access their own
    if (actor.role === 'AM' || actor.role === 'OP') {
      // Full access
    } else if (actor.role === 'INSP' && actor.inspectorId === inspectorId) {
      // Self only
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to download inspector document');
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    const metaJson =
      kind === 'INSURANCE' ? inspector.insuranceMetaJson : inspector.policeCheckMetaJson;

    if (!metaJson || typeof metaJson !== 'object') {
      throw new NotFoundError('DOCUMENT_NOT_FOUND', `No ${kind} document found for this inspector`);
    }

    const fileKey = (metaJson as Record<string, unknown>)['fileKey'] as string | undefined;
    const fileName = (metaJson as Record<string, unknown>)['fileName'] as string | null ?? null;

    if (!fileKey) {
      throw new NotFoundError('DOCUMENT_NOT_FOUND', `No ${kind} document key found for this inspector`);
    }

    const downloadUrl = await this.storageService.createSignedDownloadUrl(
      DOCUMENT_BUCKET,
      fileKey,
      DOWNLOAD_TTL_SECONDS,
    );

    return { downloadUrl, fileName };
  }
}
