import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBrandingStorageService } from '../../domain/branding-storage.service';
import { TenantNotFoundError } from '../../domain/tenant.errors';

const UPLOAD_TTL_SECONDS = 900; // 15 minutes

const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export interface GenerateLogoUploadUrlInput {
  tenantId: string;
  contentType: string;
  actor: AuthContext;
}

export interface GenerateLogoUploadUrlOutput {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}

export class GenerateLogoUploadUrlUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly brandingStorage: IBrandingStorageService,
  ) {}

  async execute(input: GenerateLogoUploadUrlInput): Promise<GenerateLogoUploadUrlOutput> {
    const { tenantId, contentType, actor } = input;

    // RBAC: AM can upload for any tenant, CL_ADMIN own tenant only
    if (actor.role === 'AM') {
      // Full access
    } else if (actor.role === 'CL_ADMIN' && actor.tenantId === tenantId) {
      // Own tenant only
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to upload logo');
    }

    // Validate content type
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new ValidationError(
        `Invalid content type. Allowed: ${[...ALLOWED_CONTENT_TYPES].join(', ')}`,
      );
    }

    // Verify tenant exists
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    // Generate storage key
    const extension = MIME_EXTENSION_MAP[contentType] ?? 'bin';
    const storageKey = `tenants/${tenantId}/branding/logo.${extension}`;

    // Generate presigned URL
    const { url } = await this.brandingStorage.createSignedUploadUrl(
      storageKey,
      contentType,
      UPLOAD_TTL_SECONDS,
    );

    return {
      uploadUrl: url,
      storageKey,
      expiresIn: UPLOAD_TTL_SECONDS,
    };
  }
}
