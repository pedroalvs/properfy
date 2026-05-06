import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAppointmentAssetsUseCase } from '../../../src/modules/inspector-execution/application/use-cases/list-appointment-assets.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { IInspectionAssetRepository } from '../../../src/modules/inspector-execution/domain/inspection-asset.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import { InspectionAssetEntity } from '../../../src/modules/inspector-execution/domain/inspection-asset.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { ExecutionAppointmentNotFoundError } from '../../../src/modules/inspector-execution/domain/inspection-execution.errors';
import type { AuthContext } from '@properfy/shared';

const APPOINTMENT_ID = 'appt-00000000-0000-0000-0000-000000000001';
const ASSET_ID = 'asset-00000000-0000-0000-0000-000000000001';

function makeAsset(
  overrides: Partial<ConstructorParameters<typeof InspectionAssetEntity>[0]> = {},
): InspectionAssetEntity {
  return new InspectionAssetEntity({
    id: ASSET_ID,
    appointmentId: APPOINTMENT_ID,
    inspectionExecutionId: 'exec-1',
    storageKey: `inspections/tenant-1/${APPOINTMENT_ID}/${ASSET_ID}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 204800,
    kind: 'PHOTO',
    status: 'UPLOADED',
    uploadedBy: 'user-insp-1',
    uploadExpiresAt: null,
    originalFilename: 'photo_sala.jpg',
    createdAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('ListAppointmentAssetsUseCase', () => {
  let assetRepo: IInspectionAssetRepository;
  let appointmentRepo: IAppointmentRepository;
  let authorizationService: AuthorizationService;
  let useCase: ListAppointmentAssetsUseCase;

  beforeEach(() => {
    assetRepo = {
      findById: vi.fn(),
      findByExecutionId: vi.fn(),
      findUploadedByExecutionId: vi.fn(),
      findUploadedByAppointmentId: vi.fn().mockResolvedValue([makeAsset()]),
      findExpiredPending: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    } as unknown as IInspectionAssetRepository;
    appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: { id: APPOINTMENT_ID, tenantId: 'tenant-1' },
        contact: null,
        restrictions: [],
      }),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
    } as unknown as IAppointmentRepository;
    authorizationService = new AuthorizationService({ log: vi.fn() } as never);
    useCase = new ListAppointmentAssetsUseCase(assetRepo, appointmentRepo, authorizationService);
  });

  it('should return uploaded assets for AM', async () => {
    const result = await useCase.execute(APPOINTMENT_ID, makeActor({ role: 'AM' }));

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: ASSET_ID,
      storageKey: expect.stringContaining(APPOINTMENT_ID),
      mimeType: 'image/jpeg',
      sizeBytes: 204800,
      kind: 'PHOTO',
      status: 'UPLOADED',
      originalFilename: 'photo_sala.jpg',
      createdAt: '2026-01-15T10:00:00.000Z',
    });
  });

  it('should return uploaded assets for OP', async () => {
    const result = await useCase.execute(APPOINTMENT_ID, makeActor({ role: 'OP', tenantId: 'tenant-1' }));

    expect(result.data).toHaveLength(1);
  });

  it('should return empty array when no assets', async () => {
    vi.mocked(assetRepo.findUploadedByAppointmentId).mockResolvedValue([]);

    const result = await useCase.execute(APPOINTMENT_ID, makeActor({ role: 'AM' }));

    expect(result.data).toHaveLength(0);
  });

  it('should reject CL_ADMIN', async () => {
    await expect(
      useCase.execute(APPOINTMENT_ID, makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject INSP', async () => {
    await expect(
      useCase.execute(APPOINTMENT_ID, makeActor({ role: 'INSP', inspectorId: 'insp-1' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw ExecutionAppointmentNotFoundError when appointment does not exist', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute(APPOINTMENT_ID, makeActor({ role: 'AM' })),
    ).rejects.toBeInstanceOf(ExecutionAppointmentNotFoundError);
  });

  it('should include originalFilename in response', async () => {
    vi.mocked(assetRepo.findUploadedByAppointmentId).mockResolvedValue([
      makeAsset({ originalFilename: 'foto_quarto.jpg' }),
      makeAsset({ id: 'asset-2', originalFilename: null }),
    ]);

    const result = await useCase.execute(APPOINTMENT_ID, makeActor({ role: 'AM' }));

    expect(result.data[0]?.originalFilename).toBe('foto_quarto.jpg');
    expect(result.data[1]?.originalFilename).toBeNull();
  });
});
