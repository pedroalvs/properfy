import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetInspectorDocumentDownloadUrlUseCase } from '../../../src/modules/inspector/application/use-cases/get-inspector-document-download-url.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';
import { InspectorNotFoundError } from '../../../src/modules/inspector/domain/inspector.errors';

const INSPECTOR_ID = '00000000-0000-0000-0000-000000000001';
const FILE_ID = '11111111-1111-1111-1111-111111111111';
const INSURANCE_KEY = `inspectors/${INSPECTOR_ID}/documents/insurance/${FILE_ID}.pdf`;
const SIGNED_URL = 'https://storage.example.com/inspector-documents/signed-download?sig=abc';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: INSPECTOR_ID,
    userId: 'user-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [],
    clientEligibilityJson: [],
    blockedClientsJson: [],
    fullName: null,
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    insuranceMetaJson: {
      fileKey: INSURANCE_KEY,
      fileName: 'insurance_cert.pdf',
      sizeBytes: 102400,
      uploadedAt: '2026-01-01T00:00:00.000Z',
      uploadedBy: 'user-am',
    },
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    policeCheckMetaJson: null,
    photoStorageKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
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

describe('GetInspectorDocumentDownloadUrlUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let storageService: IStorageService;
  let useCase: GetInspectorDocumentDownloadUrlUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn().mockResolvedValue(makeInspector()),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      linkUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findByRegionId: vi.fn(),
    } as unknown as IInspectorRepository;
    storageService = {
      createSignedUploadUrl: vi.fn(),
      createSignedDownloadUrl: vi.fn().mockResolvedValue(SIGNED_URL),
      headObject: vi.fn(),
      deleteObject: vi.fn(),
    } as unknown as IStorageService;
    useCase = new GetInspectorDocumentDownloadUrlUseCase(inspectorRepo, storageService);
  });

  it('should return signed download URL for INSURANCE document', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.downloadUrl).toBe(SIGNED_URL);
    expect(result.fileName).toBe('insurance_cert.pdf');
    expect(storageService.createSignedDownloadUrl).toHaveBeenCalledWith(
      'inspector-documents',
      INSURANCE_KEY,
      300,
    );
  });

  it('should return signed download URL for POLICE_CHECK document', async () => {
    const policeKey = `inspectors/${INSPECTOR_ID}/documents/police_check/${FILE_ID}.pdf`;
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({
        insuranceMetaJson: null,
        policeCheckMetaJson: {
          fileKey: policeKey,
          fileName: 'police_check.pdf',
          sizeBytes: 51200,
          uploadedAt: '2026-01-01T00:00:00.000Z',
          uploadedBy: 'user-am',
        },
      }),
    );

    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'POLICE_CHECK',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.downloadUrl).toBe(SIGNED_URL);
    expect(result.fileName).toBe('police_check.pdf');
  });

  it('should allow OP to get download URL', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.downloadUrl).toBe(SIGNED_URL);
  });

  it('should allow INSP to download their own documents', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      actor: makeActor({ role: 'INSP', inspectorId: INSPECTOR_ID }),
    });

    expect(result.downloadUrl).toBe(SIGNED_URL);
  });

  it('should reject INSP downloading another inspector documents', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        actor: makeActor({ role: 'INSP', inspectorId: 'other-inspector-id' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject CL_ADMIN', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw NotFoundError when no insurance document exists', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ insuranceMetaJson: null }),
    );

    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('should throw InspectorNotFoundError when inspector does not exist', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorNotFoundError);
  });

  it('should use TTL of 5 minutes (300s)', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      actor: makeActor({ role: 'AM' }),
    });

    expect(storageService.createSignedDownloadUrl).toHaveBeenCalledWith(
      'inspector-documents',
      expect.any(String),
      300,
    );
  });
});
