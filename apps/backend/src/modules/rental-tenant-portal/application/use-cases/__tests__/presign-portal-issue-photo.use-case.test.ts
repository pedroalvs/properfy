import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPortalIssueStorageKey, DEFAULT_PROPERTY_FILES_SETTING } from '@properfy/shared';
import type { PropertyFilesSetting } from '@properfy/shared';
import { PresignPortalIssuePhotoUseCase } from '../presign-portal-issue-photo.use-case';
import type { IPropertyFileRepository } from '../../../../property-file/domain/property-file.repository';
import type { IPropertyIssueRepository } from '../../../../property-file/domain/property-issue.repository';
import type { IStorageService } from '../../../../inspector-execution/domain/storage.service';
import type { IPlatformSettingsReader } from '../../../../../shared/domain/platform-settings';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROPERTY_A = '11111111-1111-1111-1111-111111111111';
const APPT_A = '22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-11-07T00:00:00.000Z');

function platformSettings(overrides: Partial<PropertyFilesSetting> = {}): IPlatformSettingsReader {
  const config = { ...DEFAULT_PROPERTY_FILES_SETTING, ...overrides };
  return { get: vi.fn(async () => config as never) } as unknown as IPlatformSettingsReader;
}

function build(opts: { propertyId?: string | null; scopeNull?: boolean } = {}) {
  const created: unknown[] = [];
  const issueRepo = {
    findAppointmentScope: vi.fn(async () =>
      opts.scopeNull
        ? null
        : { propertyId: opts.propertyId === undefined ? PROPERTY_A : opts.propertyId, tenantId: TENANT_A },
    ),
  } as unknown as IPropertyIssueRepository;
  const fileRepo = {
    create: vi.fn(async (input) => {
      created.push(input);
      return input;
    }),
  } as unknown as IPropertyFileRepository;
  const storage = {
    createSignedUploadUrl: vi.fn(async (_b: string, key: string) => ({
      url: `https://storage.example.com/${key}?sig=1`,
      storageKey: key,
    })),
  } as unknown as IStorageService;
  const uc = new PresignPortalIssuePhotoUseCase(fileRepo, issueRepo, storage, platformSettings(), {
    now: () => NOW,
  });
  return { uc, created, storage, fileRepo };
}

describe('PresignPortalIssuePhotoUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves scope from the token appointment and creates a PENDING, unowned ISSUE photo', async () => {
    const { uc, created, storage } = build();
    const res = await uc.execute({
      appointmentId: APPT_A,
      input: { fileName: 'leak.jpg', mime: 'image/jpeg' },
    });

    expect(res.fileId).toMatch(/[0-9a-f-]{36}/);
    expect(res.uploadUrl).toContain('https://storage.example.com/');
    // The portal presign response never carries storageKey (it embeds tenantId).
    expect(res).not.toHaveProperty('storageKey');

    const row = created[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      tenantId: TENANT_A,
      propertyId: PROPERTY_A,
      appointmentId: APPT_A,
      issueId: null,
      type: 'ISSUE',
      status: 'PENDING',
      uploadedByUserId: null,
    });
    const expectedKey = buildPortalIssueStorageKey({
      tenantId: TENANT_A,
      appointmentId: APPT_A,
      fileId: res.fileId,
      ext: 'jpg',
    });
    expect(row.storageKey).toBe(expectedKey);
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(
      'inspection-assets',
      expectedKey,
      900,
      'image/jpeg',
    );
  });

  it('rejects a MIME outside issueImageMimes (C.A5, presign side)', async () => {
    const { uc, fileRepo } = build();
    await expect(
      uc.execute({ appointmentId: APPT_A, input: { fileName: 'doc.pdf', mime: 'application/pdf' } }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_MIME_NOT_ALLOWED' });
    expect(fileRepo.create).not.toHaveBeenCalled();
  });

  it('rejects when the token appointment has no property (422)', async () => {
    const { uc } = build({ propertyId: null });
    await expect(
      uc.execute({ appointmentId: APPT_A, input: { fileName: 'leak.jpg', mime: 'image/jpeg' } }),
    ).rejects.toMatchObject({ code: 'PORTAL_ISSUE_NO_PROPERTY', statusCode: 422 });
  });

  it('404s when the appointment scope cannot be resolved', async () => {
    const { uc } = build({ scopeNull: true });
    await expect(
      uc.execute({ appointmentId: APPT_A, input: { fileName: 'leak.jpg', mime: 'image/jpeg' } }),
    ).rejects.toMatchObject({ code: 'PROPERTY_NOT_FOUND' });
  });
});
