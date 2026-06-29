import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateInspectorDocumentUploadUrlUseCase } from '../../../src/modules/inspector/application/use-cases/generate-inspector-document-upload-url.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { InspectorNotFoundError } from '../../../src/modules/inspector/domain/inspector.errors';

const INSPECTOR_ID = '00000000-0000-0000-0000-000000000001';

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
    blockedClientsJson: [],
    fullName: null,
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    insuranceMetaJson: null,
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

describe('GenerateInspectorDocumentUploadUrlUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let storageService: IStorageService;
  let auditService: AuditService;
  let useCase: GenerateInspectorDocumentUploadUrlUseCase;

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
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        url: 'https://storage.example.com/inspector-documents/signed-upload',
        storageKey: `inspectors/${INSPECTOR_ID}/documents/insurance/some-uuid.pdf`,
      }),
      createSignedDownloadUrl: vi.fn(),
      headObject: vi.fn(),
      deleteObject: vi.fn(),
    } as unknown as IStorageService;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new GenerateInspectorDocumentUploadUrlUseCase(inspectorRepo, storageService, auditService);
  });

  it('should return presigned URL for INSURANCE document', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      mimeType: 'application/pdf',
      fileName: 'insurance.pdf',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.uploadUrl).toBeDefined();
    expect(result.storageKey).toMatch(/^inspectors\/.+\/documents\/insurance\/.+\.pdf$/);
    expect(result.expiresAt).toBeDefined();
  });

  it('should return presigned URL for POLICE_CHECK document', async () => {
    vi.mocked(storageService.createSignedUploadUrl).mockResolvedValue({
      url: 'https://example.com/upload',
      storageKey: `inspectors/${INSPECTOR_ID}/documents/police_check/some-uuid.pdf`,
    });

    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'POLICE_CHECK',
      mimeType: 'application/pdf',
      fileName: 'police_check.pdf',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.storageKey).toMatch(/^inspectors\/.+\/documents\/police_check\/.+\.pdf$/);
  });

  it('should allow OP to generate document upload URL', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      mimeType: 'image/jpeg',
      fileName: 'insurance_card.jpg',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.uploadUrl).toBeDefined();
  });

  it('should reject INSP from generating document upload URL', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        mimeType: 'application/pdf',
        fileName: 'insurance.pdf',
        actor: makeActor({ role: 'INSP', inspectorId: INSPECTOR_ID }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject CL_ADMIN', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        mimeType: 'application/pdf',
        fileName: 'insurance.pdf',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject disallowed MIME types', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        mimeType: 'text/plain',
        fileName: 'doc.txt',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should generate unique UUID per upload (not fixed key like avatar)', async () => {
    const key1Uuid = '11111111-1111-1111-1111-111111111111';
    const key2Uuid = '22222222-2222-2222-2222-222222222222';
    vi.mocked(storageService.createSignedUploadUrl)
      .mockResolvedValueOnce({
        url: 'https://example.com/1',
        storageKey: `inspectors/${INSPECTOR_ID}/documents/insurance/${key1Uuid}.pdf`,
      })
      .mockResolvedValueOnce({
        url: 'https://example.com/2',
        storageKey: `inspectors/${INSPECTOR_ID}/documents/insurance/${key2Uuid}.pdf`,
      });

    const result1 = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      mimeType: 'application/pdf',
      fileName: 'ins1.pdf',
      actor: makeActor({ role: 'AM' }),
    });

    const result2 = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      mimeType: 'application/pdf',
      fileName: 'ins2.pdf',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result1.storageKey).not.toBe(result2.storageKey);
  });

  it('should throw InspectorNotFoundError when inspector does not exist', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        mimeType: 'application/pdf',
        fileName: 'insurance.pdf',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorNotFoundError);
  });

  it('should sign upload with content type', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      mimeType: 'application/pdf',
      fileName: 'insurance.pdf',
      actor: makeActor({ role: 'AM' }),
    });

    expect(storageService.createSignedUploadUrl).toHaveBeenCalledWith(
      'inspector-documents',
      expect.any(String),
      900,
      'application/pdf',
    );
  });

  it('should audit the presign action', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      mimeType: 'application/pdf',
      fileName: 'insurance.pdf',
      actor: makeActor({ role: 'AM' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector.document_upload_presigned',
        entityType: 'Inspector',
        entityId: INSPECTOR_ID,
        after: expect.objectContaining({ kind: 'INSURANCE' }),
      }),
    );
  });
});
