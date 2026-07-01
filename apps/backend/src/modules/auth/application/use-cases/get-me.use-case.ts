import type { IUserRepository } from '../../domain/user.repository';
import type { UserRole, UserStatus } from '@properfy/shared';
import { UnauthorizedError } from '../../../../shared/domain/errors';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';

const AVATAR_BUCKET = 'inspector-avatars';
const AVATAR_SIGNED_URL_TTL = 900; // 15 minutes

export interface GetMeOutput {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  tenantId: string | null;
  branchId: string | null;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  inspectorId: string | null;
  inspectorPhotoUrl: string | null;
  // 031 — CL_USER granular permission flags (tenant-cohort) so the web can
  // mirror server-side gating (e.g. `view_financials`) for nav/route visibility.
  clUserPermissions?: string[];
}

export class GetMeUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly storageService: IStorageService,
    private readonly tenantRepo: ITenantRepository,
  ) {}

  async execute(userId: string): Promise<GetMeOutput> {
    const user = await this.userRepo.findById(userId);

    if (!user || user.isDeleted() || user.isInactive()) {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
    }

    let inspectorId: string | null = null;
    let inspectorPhotoUrl: string | null = null;

    if (user.role === 'INSP') {
      const inspector = await this.inspectorRepo.findByUserId(userId);
      if (inspector) {
        inspectorId = inspector.id;
        if (inspector.photoStorageKey) {
          inspectorPhotoUrl = await this.storageService.createSignedDownloadUrl(
            AVATAR_BUCKET,
            inspector.photoStorageKey,
            AVATAR_SIGNED_URL_TTL,
          );
        }
      }
    }

    let clUserPermissions: string[] | undefined;
    if (user.role === 'CL_USER' && user.tenantId) {
      const tenant = await this.tenantRepo.findById(user.tenantId);
      clUserPermissions = (tenant?.settingsJson?.clUserPermissions as string[] | undefined) ?? [];
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      tenantId: user.tenantId,
      branchId: user.branchId,
      totpEnabled: user.totpEnabled,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      inspectorId,
      inspectorPhotoUrl,
      clUserPermissions,
    };
  }
}
