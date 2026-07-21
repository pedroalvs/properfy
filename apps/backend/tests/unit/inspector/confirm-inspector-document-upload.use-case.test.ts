import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmInspectorDocumentUploadUseCase } from '../../../src/modules/inspector/application/use-cases/confirm-inspector-document-upload.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import {
  InspectorNotFoundError,
  InspectorDocumentInvalidKeyError,
  InspectorDocumentObjectNotFoundError,
} from '../../../src/modules/inspector/domain/inspector.errors';

const INSPECTOR_ID = '00000000-0000-0000-0000-000000000001';
const FILE_ID = '11111111-1111-1111-1111-111111111111';
const INSURANCE_KEY = `inspectors/${INSPECTOR_ID}/documents/insurance/${FILE_ID}.pdf`;
const POLICE_KEY = `inspectors/${INSPECTOR_ID}/documents/police_check/${FILE_ID}.pdf`;

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

describe('ConfirmInspectorDocumentUploadUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let storageService: IStorageService;
  let auditService: AuditService;
  let useCase: ConfirmInspectorDocumentUploadUseCase;

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
      createSignedDownloadUrl: vi.fn(),
      headObject: vi.fn().mockResolvedValue({ exists: true, sizeBytes: 102400 }),
      deleteObject: vi.fn(),
    } as unknown as IStorageService;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new ConfirmInspectorDocumentUploadUseCase(inspectorRepo, storageService, auditService);
  });

  it('should persist insuranceMetaJson for INSURANCE kind', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      storageKey: INSURANCE_KEY,
      fileName: 'insurance_cert.pdf',
      actor: makeActor({ role: 'AM', userId: 'user-am' }),
    });

    expect(result.inspectorId).toBe(INSPECTOR_ID);
    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      insuranceMetaJson: expect.objectContaining({
        fileKey: INSURANCE_KEY,
        fileName: 'insurance_cert.pdf',
        sizeBytes: 102400,
        uploadedBy: 'user-am',
        uploadedAt: expect.any(String),
      }),
    });
  });

  it('should persist policeCheckMetaJson for POLICE_CHECK kind', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'POLICE_CHECK',
      storageKey: POLICE_KEY,
      fileName: 'police_check.pdf',
      actor: makeActor({ role: 'AM' }),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      policeCheckMetaJson: expect.objectContaining({
        fileKey: POLICE_KEY,
        fileName: 'police_check.pdf',
      }),
    });
  });

  it('should verify headObject before persisting', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      storageKey: INSURANCE_KEY,
      fileName: 'insurance.pdf',
      actor: makeActor({ role: 'AM' }),
    });

    expect(storageService.headObject).toHaveBeenCalledWith('inspector-documents', INSURANCE_KEY);
  });

  it('should throw InspectorDocumentObjectNotFoundError when object not in storage', async () => {
    vi.mocked(storageService.headObject).mockResolvedValue({ exists: false });

    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        storageKey: INSURANCE_KEY,
        fileName: 'insurance.pdf',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorDocumentObjectNotFoundError);

    expect(inspectorRepo.update).not.toHaveBeenCalled();
  });

  it('should throw InspectorDocumentInvalidKeyError for bad key format', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        storageKey: 'wrong/path/file.pdf',
        fileName: 'file.pdf',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorDocumentInvalidKeyError);
  });

  it('should throw InspectorDocumentInvalidKeyError for non-UUID inspector ID in key', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        storageKey: 'inspectors/not-a-uuid/documents/insurance/some-uuid.pdf',
        fileName: 'file.pdf',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorDocumentInvalidKeyError);
  });

  it('should allow OP to confirm', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      storageKey: INSURANCE_KEY,
      fileName: 'insurance.pdf',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.inspectorId).toBe(INSPECTOR_ID);
  });

  it('should reject INSP from confirming documents', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        storageKey: INSURANCE_KEY,
        fileName: 'insurance.pdf',
        actor: makeActor({ role: 'INSP', inspectorId: INSPECTOR_ID }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw InspectorNotFoundError when inspector does not exist', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        kind: 'INSURANCE',
        storageKey: INSURANCE_KEY,
        fileName: 'insurance.pdf',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorNotFoundError);
  });

  it('should audit the confirm action', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      kind: 'INSURANCE',
      storageKey: INSURANCE_KEY,
      fileName: 'insurance.pdf',
      actor: makeActor({ role: 'AM' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector.document_confirmed',
        entityType: 'Inspector',
        entityId: INSPECTOR_ID,
        after: { kind: 'INSURANCE', storageKey: INSURANCE_KEY, fileName: 'insurance.pdf' },
      }),
    );
  });
});

describe('inspector document upload error codes', () => {
  it('InspectorDocumentInvalidKeyError carries INSPECTOR_DOCUMENT_KEY_INVALID with status 400', () => {
    const err = new InspectorDocumentInvalidKeyError();
    expect(err.code).toBe('INSPECTOR_DOCUMENT_KEY_INVALID');
    expect(err.statusCode).toBe(400);
  });

  it('InspectorDocumentObjectNotFoundError carries INSPECTOR_DOCUMENT_OBJECT_NOT_FOUND with status 400', () => {
    const err = new InspectorDocumentObjectNotFoundError();
    expect(err.code).toBe('INSPECTOR_DOCUMENT_OBJECT_NOT_FOUND');
    expect(err.statusCode).toBe(400);
  });
});
