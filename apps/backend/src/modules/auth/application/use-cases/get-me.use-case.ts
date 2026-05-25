import type { IUserRepository } from '../../domain/user.repository';
import type { UserRole, UserStatus } from '@properfy/shared';
import { UnauthorizedError } from '../../../../shared/domain/errors';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IStorageService } from '../../../inspector-execution/domain/storage.service';

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
}

export class GetMeUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly storageService: IStorageService,
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
    };
  }
}
