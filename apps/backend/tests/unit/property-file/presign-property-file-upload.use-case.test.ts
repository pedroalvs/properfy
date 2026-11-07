import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresignPropertyFileUploadUseCase } from '../../../src/modules/property-file/application/use-cases/presign-property-file-upload.use-case';
import type { IPropertyFileRepository } from '../../../src/modules/property-file/domain/property-file.repository';
import type { IPropertyIssueRepository } from '../../../src/modules/property-file/domain/property-issue.repository';
import type { IInspectorAppointmentVisibility } from '../../../src/modules/property-file/domain/inspector-appointment-visibility';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import { FakeClock } from '../../helpers/fake-clock';
import {
  makeActor,
  makeAuthorizationService,
  makePlatformSettings,
  TENANT_A,
  TENANT_B,
  PROPERTY_A,
  APPT_A,
  INSPECTOR_A,
} from './_helpers';

function build(opts: {
  propertyTenantId?: string | null;
  visibility?: Partial<{ propertyId: string; tenantId: string }> | null;
} = {}) {
  const created: unknown[] = [];
  const fileRepo = {
    findPropertyTenantId: vi.fn(async () =>
      opts.propertyTenantId === undefined ? TENANT_A : opts.propertyTenantId,
    ),
    create: vi.fn(async (input) => {
      created.push(input);
      return input;
    }),
  } as unknown as IPropertyFileRepository;
  const issueRepo = {
    findAppointmentScope: vi.fn(async () => ({ propertyId: PROPERTY_A, tenantId: TENANT_A })),
  } as unknown as IPropertyIssueRepository;
  const visibility = {
    resolveForInspector: vi.fn(async () =>
      opts.visibility === null
        ? null
        : { propertyId: PROPERTY_A, tenantId: TENANT_A, ...(opts.visibility ?? {}) },
    ),
  } as unknown as IInspectorAppointmentVisibility;
  const storage = {
    createSignedUploadUrl: vi.fn(async (_b, key) => ({ url: `https://signed/${key}`, storageKey: key })),
  } as unknown as IStorageService;
  const uc = new PresignPropertyFileUploadUseCase(
    fileRepo,
    issueRepo,
    visibility,
    storage,
    makePlatformSettings(),
    makeAuthorizationService(),
    new FakeClock(new Date('2026-11-08T00:00:00Z')),
  );
  return { uc, fileRepo, storage, visibility, created };
}

const docInput = {
  propertyId: PROPERTY_A,
  type: 'DOCUMENT' as const,
  fileName: 'lease.pdf',
  mime: 'application/pdf',
};

describe('PresignPropertyFileUploadUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AM presigns a document: builds the key, persists a PENDING row', async () => {
    const { uc, created } = build();
    const result = await uc.execute({ actor: makeActor('AM'), input: docInput });
    expect(result.storageKey).toBe(`files/${TENANT_A}/${PROPERTY_A}/${result.fileId}.pdf`);
    expect(result.uploadUrl).toContain('https://signed/');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: 'PENDING', type: 'DOCUMENT', version: 1, tenantId: TENANT_A });
  });

  it('rejects CL_USER (not in the upload matrix)', async () => {
    const { uc } = build();
    await expect(uc.execute({ actor: makeActor('CL_USER'), input: docInput })).rejects.toThrow();
  });

  it('rejects a disallowed MIME (C.A5 presign side)', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ actor: makeActor('AM'), input: { ...docInput, mime: 'application/x-msdownload' } }),
    ).rejects.toMatchObject({ code: 'PROPERTY_FILE_MIME_NOT_ALLOWED' });
  });

  it('404s when the property does not exist (never reveals existence)', async () => {
    const { uc } = build({ propertyTenantId: null });
    await expect(uc.execute({ actor: makeActor('AM'), input: docInput })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('CL_ADMIN of another tenant 404s on a foreign property', async () => {
    const { uc } = build({ propertyTenantId: TENANT_B });
    await expect(uc.execute({ actor: makeActor('CL_ADMIN'), input: docInput })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('INSP may presign an ISSUE photo on a visible appointment, scoped to its tenant', async () => {
    const { uc, created } = build();
    const result = await uc.execute({
      actor: makeActor('INSP'),
      input: { propertyId: PROPERTY_A, appointmentId: APPT_A, type: 'ISSUE', fileName: 'door.jpg', mime: 'image/jpeg' },
    });
    expect(result.storageKey).toContain(`files/${TENANT_A}/${PROPERTY_A}/`);
    expect(created[0]).toMatchObject({ type: 'ISSUE', appointmentId: APPT_A, uploadedByUserId: expect.any(String) });
  });

  it('rejects an INSP presign of a non-issue file', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ actor: makeActor('INSP'), input: { ...docInput, appointmentId: APPT_A } }),
    ).rejects.toThrow();
  });

  it('404s an INSP presign for an appointment not visible to them', async () => {
    const { uc } = build({ visibility: null });
    await expect(
      uc.execute({
        actor: makeActor('INSP'),
        input: { propertyId: PROPERTY_A, appointmentId: APPT_A, type: 'ISSUE', fileName: 'x.jpg', mime: 'image/jpeg' },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(INSPECTOR_A).toBeTruthy();
  });
});
