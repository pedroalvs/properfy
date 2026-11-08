import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPortalIssueStorageKey, DEFAULT_PROPERTY_FILES_SETTING } from '@properfy/shared';
import type { PropertyFilesSetting } from '@properfy/shared';
import { ConfirmPortalIssuePhotoUseCase } from '../confirm-portal-issue-photo.use-case';
import type { IPropertyFileRepository } from '../../../../property-file/domain/property-file.repository';
import type { IPropertyIssueRepository } from '../../../../property-file/domain/property-issue.repository';
import type { PropertyFileEntity } from '../../../../property-file/domain/property-file.entity';
import type { IStorageService } from '../../../../inspector-execution/domain/storage.service';
import type { IPlatformSettingsReader } from '../../../../../shared/domain/platform-settings';
import type { IIdempotencyService } from '../../../../../shared/domain/idempotency.service';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROPERTY_A = '11111111-1111-1111-1111-111111111111';
const APPT_A = '22222222-2222-2222-2222-222222222222';
const APPT_B = '99999999-9999-9999-9999-999999999999';
const FILE_ID = '55555555-5555-5555-5555-555555555555';
const NOW = new Date('2026-11-07T00:00:00.000Z');

// Pad buffers so file-type's tokenizer never reads past the end.
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(4200, 0),
]);
const PDF_BYTES = Buffer.concat([
  Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'),
  Buffer.alloc(4200, 0x20),
]);

function platformSettings(overrides: Partial<PropertyFilesSetting> = {}): IPlatformSettingsReader {
  const config = { ...DEFAULT_PROPERTY_FILES_SETTING, ...overrides };
  return { get: vi.fn(async () => config as never) } as unknown as IPlatformSettingsReader;
}

function inMemoryIdempotency(): IIdempotencyService {
  const store = new Map<string, { response: unknown; payloadHash: string | null }>();
  const keyOf = (k: string, s: string) => `${s}::${k}`;
  return {
    getWithHash: vi.fn(async (k: string, s: string) => store.get(keyOf(k, s)) ?? null),
    set: vi.fn(async (k: string, s: string, response: unknown, _ttl: number, payloadHash?: string) => {
      store.set(keyOf(k, s), { response, payloadHash: payloadHash ?? null });
    }),
    get: vi.fn(),
    tryAcquire: vi.fn(),
    complete: vi.fn(),
    renew: vi.fn(),
    release: vi.fn(),
  } as unknown as IIdempotencyService;
}

function makeFile(over: Partial<PropertyFileEntity> = {}): PropertyFileEntity {
  return {
    id: FILE_ID,
    tenantId: TENANT_A,
    propertyId: PROPERTY_A,
    appointmentId: APPT_A,
    issueId: null,
    type: 'ISSUE',
    versionGroupId: 'g',
    version: 1,
    fileName: 'leak.png',
    mime: 'image/png',
    sizeBytes: 0,
    storageKey: buildPortalIssueStorageKey({
      tenantId: TENANT_A,
      appointmentId: APPT_A,
      fileId: FILE_ID,
      ext: 'png',
    }),
    status: 'PENDING',
    confirmedAt: null,
    uploadedByUserId: null,
    deletedAt: null,
    deletedByUserId: null,
    purgedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function build(opts: {
  file?: PropertyFileEntity | null;
  head?: { exists: boolean; sizeBytes: number };
  bytes?: Buffer;
  scopeTenant?: string;
} = {}) {
  const file = opts.file === undefined ? makeFile() : opts.file;
  const confirmUpload = vi.fn(async () => undefined);
  const fileRepo = {
    findById: vi.fn(async () => file),
    confirmUpload,
  } as unknown as IPropertyFileRepository;
  const issueRepo = {
    findAppointmentScope: vi.fn(async () => ({
      propertyId: PROPERTY_A,
      tenantId: opts.scopeTenant ?? TENANT_A,
    })),
  } as unknown as IPropertyIssueRepository;
  const storage = {
    headObject: vi.fn(async () => opts.head ?? { exists: true, sizeBytes: 1024 }),
    getObjectBytes: vi.fn(async () => opts.bytes ?? PNG_BYTES),
  } as unknown as IStorageService;
  const uc = new ConfirmPortalIssuePhotoUseCase(
    undefined,
    fileRepo,
    issueRepo,
    storage,
    platformSettings(),
    inMemoryIdempotency(),
    { now: () => NOW },
  );
  return { uc, confirmUpload };
}

describe('ConfirmPortalIssuePhotoUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an Idempotency-Key', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: undefined }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('confirms a valid issue photo: keeps it PENDING (D20) and never audits', async () => {
    const { uc, confirmUpload } = build();
    const res = await uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: 'k1' });
    expect(res.status).toBe('PENDING');
    expect(confirmUpload).toHaveBeenCalledWith(FILE_ID, 1024, false, expect.any(Date), undefined);
  });

  it('404s a file belonging to another appointment (C.A2, no disclosure)', async () => {
    const { uc } = build({ file: makeFile({ appointmentId: APPT_B }) });
    await expect(
      uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: 'k2' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_NOT_FOUND' });
  });

  it('404s a file of another tenant', async () => {
    const { uc } = build({ scopeTenant: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
    await expect(
      uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: 'k3' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_NOT_FOUND' });
  });

  it('404s a non-ISSUE file', async () => {
    const { uc } = build({ file: makeFile({ type: 'DOCUMENT' }) });
    await expect(
      uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: 'k4' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_NOT_FOUND' });
  });

  it('404s when the storage key encodes a different appointment (D25 key↔row)', async () => {
    const mismatchedKey = buildPortalIssueStorageKey({
      tenantId: TENANT_A,
      appointmentId: APPT_B,
      fileId: FILE_ID,
      ext: 'png',
    });
    const { uc } = build({ file: makeFile({ storageKey: mismatchedKey }) });
    await expect(
      uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: 'k5' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_NOT_FOUND' });
  });

  it('rejects a file larger than the max (C.A5, confirm side)', async () => {
    const { uc } = build({ head: { exists: true, sizeBytes: 21 * 1024 * 1024 } });
    await expect(
      uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: 'k6' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_TOO_LARGE' });
  });

  it('rejects a magic-byte mismatch (declared png, content pdf) (C.A5)', async () => {
    const { uc } = build({ bytes: PDF_BYTES });
    await expect(
      uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: 'k7' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_CONTENT_MISMATCH' });
  });

  it('rejects when the storage object is missing', async () => {
    const { uc } = build({ head: { exists: false, sizeBytes: 0 } });
    await expect(
      uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: 'k8' }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_OBJECT_MISSING' });
  });

  it('is idempotent: replaying the same key returns the cached result without re-confirming', async () => {
    const { uc, confirmUpload } = build();
    const first = await uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: 'dup' });
    const second = await uc.execute({ appointmentId: APPT_A, fileId: FILE_ID, idempotencyKey: 'dup' });
    expect(second).toEqual(first);
    expect(confirmUpload).toHaveBeenCalledTimes(1);
  });
});
