import { describe, expect, it, vi } from 'vitest';
import { ConfirmAssetUploadUseCase } from './confirm-asset-upload.use-case';
import { AssetNotFoundError } from '../../domain/inspection-execution.errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';

describe('ConfirmAssetUploadUseCase', () => {
  it('rejects confirming an asset under a different appointment route', async () => {
    const auditService = { log: vi.fn() } as never;
    const useCase = new ConfirmAssetUploadUseCase(
      {
        findById: vi.fn().mockResolvedValue({
          id: 'asset-1',
          appointmentId: 'apt-2',
          uploadedBy: 'user-1',
          isUploaded: () => false,
          isExpired: () => false,
          storageKey: 'key',
        }),
      } as never,
      { headObject: vi.fn() } as never,
      new AuthorizationService(auditService),
    );

    await expect(
      useCase.execute({
        appointmentId: 'apt-1',
        assetId: 'asset-1',
        actor: {
          userId: 'user-1',
          tenantId: 'tenant-1',
          branchId: null,
          role: 'INSP',
          inspectorId: 'insp-1',
        },
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);
  });
});
