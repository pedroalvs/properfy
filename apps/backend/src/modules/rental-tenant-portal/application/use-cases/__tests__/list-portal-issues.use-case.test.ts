import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPortalIssuesUseCase } from '../list-portal-issues.use-case';
import type { IPropertyIssueRepository } from '../../../../property-file/domain/property-issue.repository';
import type { IPropertyFileRepository } from '../../../../property-file/domain/property-file.repository';
import type { PropertyIssueEntity } from '../../../../property-file/domain/property-issue.entity';
import type { PropertyFileEntity } from '../../../../property-file/domain/property-file.entity';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROPERTY_A = '11111111-1111-1111-1111-111111111111';
const APPT_A = '22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-11-07T00:00:00.000Z');

function issue(
  id: string,
  source: PropertyIssueEntity['source'],
  over: Partial<PropertyIssueEntity> = {},
): PropertyIssueEntity {
  return {
    id,
    tenantId: TENANT_A,
    propertyId: PROPERTY_A,
    appointmentId: APPT_A,
    reason: `reason-${id}`,
    source,
    createdByUserId: source === 'RENTAL_TENANT_PORTAL' ? null : 'some-user',
    cantDoEventId: null,
    seenAt: NOW,
    seenByUserId: 'staff-user',
    deletedAt: null,
    deletedByUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function photo(id: string, issueId: string): PropertyFileEntity {
  return {
    id,
    tenantId: TENANT_A,
    propertyId: PROPERTY_A,
    appointmentId: APPT_A,
    issueId,
    type: 'ISSUE',
    versionGroupId: 'g',
    version: 1,
    fileName: `${id}.jpg`,
    mime: 'image/jpeg',
    sizeBytes: 100,
    storageKey: `files/${TENANT_A}/tenant-issues/${APPT_A}/${id}.jpg`,
    status: 'READY',
    confirmedAt: NOW,
    uploadedByUserId: null,
    deletedAt: null,
    deletedByUserId: null,
    purgedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function build(opts: { issues?: PropertyIssueEntity[]; photos?: PropertyFileEntity[]; scopeNull?: boolean } = {}) {
  const issueRepo = {
    findAppointmentScope: vi.fn(async () =>
      opts.scopeNull ? null : { propertyId: PROPERTY_A, tenantId: TENANT_A },
    ),
    listByAppointment: vi.fn(async () => opts.issues ?? []),
  } as unknown as IPropertyIssueRepository;
  const fileRepo = {
    listReadyPhotosByIssueIds: vi.fn(async () => opts.photos ?? []),
  } as unknown as IPropertyFileRepository;
  const uc = new ListPortalIssuesUseCase(issueRepo, fileRepo);
  return { uc, issueRepo, fileRepo };
}

describe('ListPortalIssuesUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only RENTAL_TENANT_PORTAL issues, mapped to the privacy DTO', async () => {
    const { uc, fileRepo } = build({
      issues: [
        issue('portal-1', 'RENTAL_TENANT_PORTAL'),
        issue('staff-1', 'STAFF'),
        issue('insp-1', 'INSPECTOR'),
      ],
      photos: [photo('p1', 'portal-1')],
    });
    const res = await uc.execute({ appointmentId: APPT_A });

    expect(res.issues).toHaveLength(1);
    const dto = res.issues[0]!;
    expect(dto.id).toBe('portal-1');
    expect(dto.photos).toHaveLength(1);
    // Never leaks staff-internal fields.
    expect(dto).not.toHaveProperty('source');
    expect(dto).not.toHaveProperty('createdByUserId');
    expect(dto).not.toHaveProperty('seenAt');
    expect(dto).not.toHaveProperty('seenByUserId');
    // Photos were fetched only for the portal issue ids.
    expect(fileRepo.listReadyPhotosByIssueIds).toHaveBeenCalledWith(['portal-1']);
  });

  it('scopes the listing to the token tenant', async () => {
    const { uc, issueRepo } = build({ issues: [] });
    await uc.execute({ appointmentId: APPT_A });
    expect(issueRepo.listByAppointment).toHaveBeenCalledWith(APPT_A, TENANT_A);
  });

  it('returns an empty list when the appointment scope cannot be resolved', async () => {
    const { uc, issueRepo } = build({ scopeNull: true });
    const res = await uc.execute({ appointmentId: APPT_A });
    expect(res.issues).toEqual([]);
    expect(issueRepo.listByAppointment).not.toHaveBeenCalled();
  });
});
