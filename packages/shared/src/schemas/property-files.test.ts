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
