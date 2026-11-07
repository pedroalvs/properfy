import { describe, it, expect, vi } from 'vitest';
import { ListPropertyFilesUseCase } from '../../../src/modules/property-file/application/use-cases/list-property-files.use-case';
import { ListPropertyIssuesUseCase } from '../../../src/modules/property-file/application/use-cases/list-property-issues.use-case';
import { CountUnseenPropertyIssuesUseCase } from '../../../src/modules/property-file/application/use-cases/count-unseen-property-issues.use-case';
import type { IPropertyFileRepository } from '../../../src/modules/property-file/domain/property-file.repository';
import type { IPropertyIssueRepository, IPropertyIssueIndicatorReader } from '../../../src/modules/property-file/domain/property-issue.repository';
import type { PropertyScopeService } from '../../../src/modules/property-file/application/property-scope.service';
import type { PropertyFileEntity } from '../../../src/modules/property-file/domain/property-file.entity';
import type { PropertyIssueEntity } from '../../../src/modules/property-file/domain/property-issue.entity';
import { makeActor, makeAuthorizationService, TENANT_A, PROPERTY_A, APPT_A } from './_helpers';

const photo: PropertyFileEntity = {
  id: 'p1', tenantId: TENANT_A, propertyId: PROPERTY_A, appointmentId: APPT_A, issueId: 'i1',
  type: 'ISSUE', versionGroupId: 'g', version: 1, fileName: 'x.jpg', mime: 'image/jpeg', sizeBytes: 1,
  storageKey: 'k', status: 'READY', confirmedAt: new Date(), uploadedByUserId: 'peer-user',
  deletedAt: null, deletedByUserId: null, purgedAt: null, createdAt: new Date(), updatedAt: new Date(),
};
const issue: PropertyIssueEntity = {
  id: 'i1', tenantId: TENANT_A, propertyId: PROPERTY_A, appointmentId: APPT_A, reason: 'broken',
  source: 'STAFF', createdByUserId: 'peer-user', cantDoEventId: 'evt', seenAt: null, seenByUserId: 'seer',
  deletedAt: null, deletedByUserId: null, createdAt: new Date(), updatedAt: new Date(),
};

const scopeInsp = { resolveReadListScope: vi.fn(async () => ({ tenantId: TENANT_A })) } as unknown as PropertyScopeService;

describe('ListPropertyFilesUseCase — INSP identity masking (D28)', () => {
  it('nulls uploadedByUserId for INSP', async () => {
    const fileRepo = {
      listReadyByAppointment: vi.fn(async () => [photo]),
      countsByAppointment: vi.fn(async () => ({ total: 1, issues: 1, documents: 0, reports: 0, other: 0 })),
    } as unknown as IPropertyFileRepository;
    const uc = new ListPropertyFilesUseCase(fileRepo, scopeInsp);
    const res = await uc.execute({ actor: makeActor('INSP'), query: { appointmentId: APPT_A } });
    expect(res.files[0]!.uploadedByUserId).toBeNull();
  });
});

describe('ListPropertyIssuesUseCase — INSP identity masking (D28)', () => {
  it('nulls createdByUserId/seenByUserId/cantDoEventId and photo uploader for INSP', async () => {
    const issueRepo = { listByAppointment: vi.fn(async () => [issue]) } as unknown as IPropertyIssueRepository;
    const fileRepo = { listReadyPhotosByIssueIds: vi.fn(async () => [photo]) } as unknown as IPropertyFileRepository;
    const uc = new ListPropertyIssuesUseCase(issueRepo, fileRepo, scopeInsp);
    const res = await uc.execute({ actor: makeActor('INSP'), query: { appointmentId: APPT_A } });
    const got = res.issues[0]!;
    expect(got.createdByUserId).toBeNull();
    expect(got.seenByUserId).toBeNull();
    expect(got.cantDoEventId).toBeNull();
    expect(got.reason).toBe('broken'); // content preserved
    expect(got.photos[0]!.uploadedByUserId).toBeNull();
  });

  it('keeps identity for AM', async () => {
    const issueRepo = { listByAppointment: vi.fn(async () => [issue]) } as unknown as IPropertyIssueRepository;
    const fileRepo = { listReadyPhotosByIssueIds: vi.fn(async () => [photo]) } as unknown as IPropertyFileRepository;
    const scopeAm = { resolveReadListScope: vi.fn(async () => ({})) } as unknown as PropertyScopeService;
    const uc = new ListPropertyIssuesUseCase(issueRepo, fileRepo, scopeAm);
    const res = await uc.execute({ actor: makeActor('AM'), query: { appointmentId: APPT_A } });
    expect(res.issues[0]!.createdByUserId).toBe('peer-user');
  });
});

describe('CountUnseenPropertyIssuesUseCase', () => {
  it('AM counts cross-tenant; CL_ADMIN is pinned', async () => {
    const reader = {
      countAppointmentsWithUnseenIssues: vi.fn(async (t?: string) => (t ? 1 : 5)),
      countPropertiesWithUnseenIssuesWithoutAppointment: vi.fn(async (t?: string) => (t ? 2 : 9)),
    } as unknown as IPropertyIssueIndicatorReader;
    const uc = new CountUnseenPropertyIssuesUseCase(reader, makeAuthorizationService());
    expect(await uc.execute({ actor: makeActor('AM') })).toEqual({ appointmentsWithUnseenIssues: 5, propertiesWithUnseenIssues: 9 });
    expect(await uc.execute({ actor: makeActor('CL_ADMIN') })).toEqual({ appointmentsWithUnseenIssues: 1, propertiesWithUnseenIssues: 2 });
    await expect(uc.execute({ actor: makeActor('CL_USER') })).rejects.toThrow();
  });
});
