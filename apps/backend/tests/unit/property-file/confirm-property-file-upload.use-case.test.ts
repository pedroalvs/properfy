import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmPropertyFileUploadUseCase } from '../../../src/modules/property-file/application/use-cases/confirm-property-file-upload.use-case';
import type { IPropertyFileRepository } from '../../../src/modules/property-file/domain/property-file.repository';
import type { PropertyFileEntity } from '../../../src/modules/property-file/domain/property-file.entity';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import type { PropertyScopeService } from '../../../src/modules/property-file/application/property-scope.service';
import { InMemoryIdempotencyService } from '../../helpers/in-memory-idempotency.service';
import { FakeClock } from '../../helpers/fake-clock';
import { makeActor, makeAuthorizationService, makePlatformSettings, fakeAudit, TENANT_A, PROPERTY_A } from './_helpers';

// Pad buffers so file-type's tokenizer never reads past the end (End-Of-Stream).
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'), Buffer.alloc(4200, 0x20)]);
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(4200, 0),
]);
const FILE_ID = '55555555-5555-5555-5555-555555555555';

function makeFile(over: Partial<PropertyFileEntity> = {}): PropertyFileEntity {
  return {
    id: FILE_ID,
    tenantId: TENANT_A,
    propertyId: PROPERTY_A,
    appointmentId: null,
    issueId: null,
    type: 'DOCUMENT',
    versionGroupId: 'g',
    version: 1,
    fileName: 'lease.pdf',
    mime: 'application/pdf',
    sizeBytes: 0,
    storageKey: `files/${TENANT_A}/${PROPERTY_A}/${FILE_ID}.pdf`,
    status: 'PENDING',
    confirmedAt: null,
    uploadedByUserId: 'u',
    deletedAt: null,
    deletedByUserId: null,
    purgedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function build(opts: { file?: PropertyFileEntity; head?: { exists: boolean; sizeBytes: number }; bytes?: Buffer } = {}) {
  const file = opts.file ?? makeFile();
  const confirmUpload = vi.fn(async () => undefined);
  const fileRepo = {
    findById: vi.fn(async () => file),
    confirmUpload,
  } as unknown as IPropertyFileRepository;
  const storage = {
    headObject: vi.fn(async () => opts.head ?? { exists: true, sizeBytes: 1024 }),
    getObjectBytes: vi.fn(async () => opts.bytes ?? PDF_BYTES),
  } as unknown as IStorageService;
  const scope = { assertCanReadFile: vi.fn(async () => undefined) } as unknown as PropertyScopeService;
  const audit = fakeAudit();
  const uc = new ConfirmPropertyFileUploadUseCase(
    undefined, fileRepo, storage, makePlatformSettings(), scope,
    new InMemoryIdempotencyService(), audit, makeAuthorizationService(),
    new FakeClock(new Date('2026-11-08T00:00:00Z')),
  );
  return { uc, confirmUpload, audit };
}

describe('ConfirmPropertyFileUploadUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an Idempotency-Key', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ actor: makeActor('AM'), fileId: FILE_ID, idempotencyKey: undefined }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('confirms a valid document: flips to READY and audits property_file.uploaded', async () => {
    const { uc, confirmUpload, audit } = build();
    const result = await uc.execute({ actor: makeActor('AM'), fileId: FILE_ID, idempotencyKey: 'k1' });
    expect(result.status).toBe('READY');
    expect(confirmUpload).toHaveBeenCalledWith(FILE_ID, 1024, true, expect.any(Date), undefined);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'property_file.uploaded' }));
  });

  it('keeps a NEW issue photo PENDING (D20) and does not audit uploaded', async () => {
    const { uc, confirmUpload, audit } = build({
      file: makeFile({ type: 'ISSUE', issueId: null, mime: 'image/png', storageKey: `files/${TENANT_A}/${PROPERTY_A}/${FILE_ID}.png` }),
      bytes: PNG_BYTES,
    });
    const result = await uc.execute({ actor: makeActor('INSP'), fileId: FILE_ID, idempotencyKey: 'k2' });
    expect(result.status).toBe('PENDING');
    expect(confirmUpload).toHaveBeenCalledWith(FILE_ID, 1024, false, expect.any(Date), undefined);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('rejects a file larger than the max (C.A5 confirm side)', async () => {
    const { uc } = build({ head: { exists: true, sizeBytes: 21 * 1024 * 1024 } });
    await expect(
      uc.execute({ actor: makeActor('AM'), fileId: FILE_ID, idempotencyKey: 'k3' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_TOO_LARGE' });
  });

  it('rejects a magic-byte mismatch (declared pdf, content png)', async () => {
    const { uc } = build({ bytes: PNG_BYTES });
    await expect(
      uc.execute({ actor: makeActor('AM'), fileId: FILE_ID, idempotencyKey: 'k4' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_CONTENT_MISMATCH' });
  });

  it('rejects when the storage object is missing', async () => {
    const { uc } = build({ head: { exists: false, sizeBytes: 0 } });
    await expect(
      uc.execute({ actor: makeActor('AM'), fileId: FILE_ID, idempotencyKey: 'k5' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_OBJECT_MISSING' });
  });

  it('is idempotent: replaying the same key returns the cached result without re-confirming', async () => {
    const { uc, confirmUpload } = build();
    const first = await uc.execute({ actor: makeActor('AM'), fileId: FILE_ID, idempotencyKey: 'dup' });
    const second = await uc.execute({ actor: makeActor('AM'), fileId: FILE_ID, idempotencyKey: 'dup' });
    expect(second).toEqual(first);
    expect(confirmUpload).toHaveBeenCalledTimes(1);
  });
});
