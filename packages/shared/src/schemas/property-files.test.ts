import { describe, it, expect } from 'vitest';
import {
  presignPropertyFileUploadSchema,
  confirmPropertyFileUploadSchema,
  createPropertyIssueSchema,
  listPropertyFilesQuerySchema,
  listPropertyIssuesQuerySchema,
  fileCountsSchema,
  propertyIssueUnseenCountResponseSchema,
  PROPERTY_ISSUE_REASON_MAX,
  portalPresignIssuePhotoSchema,
  portalPresignIssuePhotoResponseSchema,
  portalConfirmIssuePhotoSchema,
  portalIssuePhotoResponseSchema,
  portalCreatePropertyIssueSchema,
  portalPropertyIssueResponseSchema,
  portalPropertyIssuesResponseSchema,
} from './property-files';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('presignPropertyFileUploadSchema', () => {
  it('accepts a valid issue-photo presign', () => {
    const parsed = presignPropertyFileUploadSchema.parse({
      propertyId: UUID,
      appointmentId: UUID,
      type: 'ISSUE',
      fileName: 'door.jpg',
      mime: 'image/jpeg',
      sizeBytes: 1024,
    });
    expect(parsed.type).toBe('ISSUE');
  });

  it('rejects an empty fileName and an unknown type', () => {
    expect(
      presignPropertyFileUploadSchema.safeParse({
        propertyId: UUID,
        type: 'DOCUMENT',
        fileName: '',
        mime: 'application/pdf',
      }).success,
    ).toBe(false);
    expect(
      presignPropertyFileUploadSchema.safeParse({
        propertyId: UUID,
        type: 'VIDEO',
        fileName: 'x.mp4',
        mime: 'video/mp4',
      }).success,
    ).toBe(false);
  });
});

describe('confirmPropertyFileUploadSchema', () => {
  it('requires a uuid fileId', () => {
    expect(confirmPropertyFileUploadSchema.safeParse({ fileId: UUID }).success).toBe(true);
    expect(confirmPropertyFileUploadSchema.safeParse({ fileId: 'x' }).success).toBe(false);
  });
});

describe('createPropertyIssueSchema', () => {
  it('accepts reason + optional photos and cantDoEventId; source is NOT accepted', () => {
    const parsed = createPropertyIssueSchema.parse({
      propertyId: UUID,
      appointmentId: UUID,
      reason: 'Broken window',
      photoFileIds: [UUID],
      cantDoEventId: UUID,
      // a client-sent source must be stripped (server-derived, R11):
      source: 'RENTAL_TENANT_PORTAL',
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty('source');
    expect(parsed.reason).toBe('Broken window');
  });

  it('allows an issue with no photos but rejects empty / over-long reason', () => {
    expect(
      createPropertyIssueSchema.safeParse({ propertyId: UUID, reason: 'x' }).success,
    ).toBe(true);
    expect(
      createPropertyIssueSchema.safeParse({ propertyId: UUID, reason: '   ' }).success,
    ).toBe(false);
    expect(
      createPropertyIssueSchema.safeParse({
        propertyId: UUID,
        reason: 'a'.repeat(PROPERTY_ISSUE_REASON_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe('list query schemas', () => {
  it('require at least one selector', () => {
    expect(listPropertyFilesQuerySchema.safeParse({}).success).toBe(false);
    expect(listPropertyFilesQuerySchema.safeParse({ propertyId: UUID }).success).toBe(true);
    expect(listPropertyIssuesQuerySchema.safeParse({}).success).toBe(false);
    expect(
      listPropertyIssuesQuerySchema.safeParse({ appointmentId: UUID }).success,
    ).toBe(true);
  });
});

describe('response fragments', () => {
  it('fileCounts requires non-negative integers', () => {
    expect(
      fileCountsSchema.safeParse({ total: 0, issues: 0, documents: 0, reports: 0, other: 0 })
        .success,
    ).toBe(true);
    expect(
      fileCountsSchema.safeParse({ total: -1, issues: 0, documents: 0, reports: 0, other: 0 })
        .success,
    ).toBe(false);
  });

  it('unseen-count has the two scoped counters', () => {
    const parsed = propertyIssueUnseenCountResponseSchema.parse({
      appointmentsWithUnseenIssues: 2,
      propertiesWithUnseenIssues: 1,
    });
    expect(parsed.appointmentsWithUnseenIssues).toBe(2);
  });
});

// ── Portal (F10-4) ─────────────────────────────────────────────────────────

describe('portalPresignIssuePhotoSchema', () => {
  it('accepts fileName + mime (+ optional sizeBytes) and strips token-derived fields', () => {
    const parsed = portalPresignIssuePhotoSchema.parse({
      fileName: 'leak.jpg',
      mime: 'image/jpeg',
      sizeBytes: 2048,
      // the token derives these — a client must not set them:
      propertyId: UUID,
      appointmentId: UUID,
      type: 'DOCUMENT',
    } as Record<string, unknown>);
    expect(parsed.fileName).toBe('leak.jpg');
    expect(parsed).not.toHaveProperty('propertyId');
    expect(parsed).not.toHaveProperty('appointmentId');
    expect(parsed).not.toHaveProperty('type');
  });

  it('rejects an empty or over-long fileName and a missing mime', () => {
    expect(
      portalPresignIssuePhotoSchema.safeParse({ fileName: '', mime: 'image/png' }).success,
    ).toBe(false);
    expect(
      portalPresignIssuePhotoSchema.safeParse({
        fileName: 'a'.repeat(256),
        mime: 'image/png',
      }).success,
    ).toBe(false);
    expect(portalPresignIssuePhotoSchema.safeParse({ fileName: 'x.png' }).success).toBe(false);
  });
});

describe('portalPresignIssuePhotoResponseSchema', () => {
  it('carries fileId/uploadUrl/expiresAt and never storageKey', () => {
    const parsed = portalPresignIssuePhotoResponseSchema.parse({
      fileId: UUID,
      uploadUrl: 'https://storage.example.com/signed',
      expiresAt: '2026-11-07T00:00:00.000Z',
      // a storageKey must be stripped — it embeds the agency tenantId:
      storageKey: `files/${UUID}/tenant-issues/${UUID}/${UUID}.jpg`,
    } as Record<string, unknown>);
    expect(parsed.fileId).toBe(UUID);
    expect(parsed).not.toHaveProperty('storageKey');
  });
});

describe('portalConfirmIssuePhotoSchema', () => {
  it('requires a uuid fileId', () => {
    expect(portalConfirmIssuePhotoSchema.safeParse({ fileId: UUID }).success).toBe(true);
    expect(portalConfirmIssuePhotoSchema.safeParse({ fileId: 'nope' }).success).toBe(false);
  });
});

describe('portalIssuePhotoResponseSchema', () => {
  it('exposes only metadata + status, no identity/storage fields', () => {
    const parsed = portalIssuePhotoResponseSchema.parse({
      id: UUID,
      fileName: 'leak.jpg',
      mime: 'image/jpeg',
      status: 'READY',
      createdAt: '2026-11-07T00:00:00.000Z',
      // staff/internal fields must be stripped:
      uploadedByUserId: UUID,
      storageKey: 'files/x',
      issueId: UUID,
    } as Record<string, unknown>);
    expect(parsed.status).toBe('READY');
    expect(parsed).not.toHaveProperty('uploadedByUserId');
    expect(parsed).not.toHaveProperty('storageKey');
    expect(parsed).not.toHaveProperty('issueId');
  });
});

describe('portalCreatePropertyIssueSchema', () => {
  it('accepts reason (+ optional photos) and strips token-/server-derived fields', () => {
    const parsed = portalCreatePropertyIssueSchema.parse({
      reason: 'The front gate will not lock',
      photoFileIds: [UUID],
      // these are token-/server-derived and must be stripped:
      propertyId: UUID,
      appointmentId: UUID,
      source: 'STAFF',
      cantDoEventId: UUID,
    } as Record<string, unknown>);
    expect(parsed.reason).toBe('The front gate will not lock');
    expect(parsed.photoFileIds).toEqual([UUID]);
    expect(parsed).not.toHaveProperty('propertyId');
    expect(parsed).not.toHaveProperty('appointmentId');
    expect(parsed).not.toHaveProperty('source');
    expect(parsed).not.toHaveProperty('cantDoEventId');
  });

  it('allows a reason-only report but rejects empty / whitespace / over-long reason', () => {
    expect(portalCreatePropertyIssueSchema.safeParse({ reason: 'leak' }).success).toBe(true);
    expect(portalCreatePropertyIssueSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(
      portalCreatePropertyIssueSchema.safeParse({
        reason: 'a'.repeat(PROPERTY_ISSUE_REASON_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe('portal issue response schemas', () => {
  it('issue response exposes reason + photos but no reviewer identity or seen status', () => {
    const parsed = portalPropertyIssueResponseSchema.parse({
      id: UUID,
      reason: 'leak',
      createdAt: '2026-11-07T00:00:00.000Z',
      photos: [
        {
          id: UUID,
          fileName: 'leak.jpg',
          mime: 'image/jpeg',
          status: 'READY',
          createdAt: '2026-11-07T00:00:00.000Z',
        },
      ],
      // staff-internal fields must be stripped:
      source: 'RENTAL_TENANT_PORTAL',
      createdByUserId: UUID,
      seenAt: '2026-11-07T00:00:00.000Z',
      seenByUserId: UUID,
      appointmentId: UUID,
    } as Record<string, unknown>);
    expect(parsed.photos).toHaveLength(1);
    expect(parsed).not.toHaveProperty('createdByUserId');
    expect(parsed).not.toHaveProperty('seenAt');
    expect(parsed).not.toHaveProperty('seenByUserId');
    expect(parsed).not.toHaveProperty('source');
    expect(parsed).not.toHaveProperty('appointmentId');
  });

  it('issues list wraps an array', () => {
    const parsed = portalPropertyIssuesResponseSchema.parse({ issues: [] });
    expect(parsed.issues).toEqual([]);
  });
});
