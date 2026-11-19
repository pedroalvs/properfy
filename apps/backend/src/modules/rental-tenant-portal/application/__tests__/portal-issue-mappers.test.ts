import { describe, it, expect } from 'vitest';
import {
  toPortalIssuePhotoResponse,
  toPortalPropertyIssueResponse,
} from '../portal-issue-mappers';
import type { PropertyFileEntity } from '../../../property-file/domain/property-file.entity';
import type { PropertyIssueEntity } from '../../../property-file/domain/property-issue.entity';

const UUID = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-11-07T00:00:00.000Z');

function photo(overrides: Partial<PropertyFileEntity> = {}): PropertyFileEntity {
  return {
    id: UUID,
    tenantId: UUID,
    propertyId: UUID,
    appointmentId: UUID,
    issueId: UUID,
    type: 'ISSUE',
    versionGroupId: UUID,
    version: 1,
    fileName: 'leak.jpg',
    mime: 'image/jpeg',
    sizeBytes: 2048,
    storageKey: `files/${UUID}/tenant-issues/${UUID}/${UUID}.jpg`,
    status: 'READY',
    confirmedAt: NOW,
    uploadedByUserId: null,
    deletedAt: null,
    deletedByUserId: null,
    purgedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function issue(overrides: Partial<PropertyIssueEntity> = {}): PropertyIssueEntity {
  return {
    id: UUID,
    tenantId: UUID,
    propertyId: UUID,
    appointmentId: UUID,
    reason: 'The front gate will not lock',
    source: 'RENTAL_TENANT_PORTAL',
    createdByUserId: null,
    cantDoEventId: null,
    seenAt: NOW,
    seenByUserId: UUID,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('toPortalIssuePhotoResponse', () => {
  it('exposes only id/fileName/mime/status/createdAt', () => {
    const dto = toPortalIssuePhotoResponse(photo());
    expect(dto).toEqual({
      id: UUID,
      fileName: 'leak.jpg',
      mime: 'image/jpeg',
      status: 'READY',
      createdAt: '2026-11-07T00:00:00.000Z',
    });
    // storage key, uploader, issue id, tenant id must never leak
    expect(dto).not.toHaveProperty('storageKey');
    expect(dto).not.toHaveProperty('uploadedByUserId');
    expect(dto).not.toHaveProperty('issueId');
    expect(dto).not.toHaveProperty('tenantId');
  });
});

describe('toPortalPropertyIssueResponse', () => {
  it('exposes reason + photos but never reviewer identity, seen status or source', () => {
    const dto = toPortalPropertyIssueResponse(issue(), [photo()]);
    expect(dto.id).toBe(UUID);
    expect(dto.reason).toBe('The front gate will not lock');
    expect(dto.photos).toHaveLength(1);
    expect(dto).not.toHaveProperty('source');
    expect(dto).not.toHaveProperty('createdByUserId');
    expect(dto).not.toHaveProperty('seenAt');
    expect(dto).not.toHaveProperty('seenByUserId');
    expect(dto).not.toHaveProperty('cantDoEventId');
    expect(dto).not.toHaveProperty('appointmentId');
    expect(dto).not.toHaveProperty('propertyId');
    expect(dto).not.toHaveProperty('tenantId');
  });

  it('maps an issue with no photos to an empty photos array', () => {
    const dto = toPortalPropertyIssueResponse(issue(), []);
    expect(dto.photos).toEqual([]);
  });
});
