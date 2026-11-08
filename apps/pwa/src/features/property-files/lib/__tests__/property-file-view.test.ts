import { describe, it, expect } from 'vitest';
import {
  PropertyFileType,
  PropertyIssueSource,
  type PropertyFileResponse,
  type PropertyIssueResponse,
} from '@properfy/shared';
import {
  previewKind,
  issueOriginLabel,
  groupNonIssueFiles,
  sortIssuesNewestFirst,
  subtabCounts,
  issuePhotosLabel,
} from '../property-file-view';

function file(overrides: Partial<PropertyFileResponse> = {}): PropertyFileResponse {
  return {
    id: overrides.id ?? '00000000-0000-0000-0000-00000000f001',
    propertyId: '00000000-0000-0000-0000-0000000000p1',
    appointmentId: null,
    issueId: null,
    type: PropertyFileType.DOCUMENT,
    versionGroupId: '00000000-0000-0000-0000-0000000000v1',
    version: 1,
    fileName: 'file.pdf',
    mime: 'application/pdf',
    sizeBytes: 100,
    status: 'READY',
    uploadedByUserId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function issue(overrides: Partial<PropertyIssueResponse> = {}): PropertyIssueResponse {
  return {
    id: overrides.id ?? '00000000-0000-0000-0000-00000000i001',
    propertyId: '00000000-0000-0000-0000-0000000000p1',
    appointmentId: null,
    reason: 'Broken window',
    source: PropertyIssueSource.STAFF,
    createdByUserId: null,
    cantDoEventId: null,
    seenAt: null,
    seenByUserId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    photos: [],
    ...overrides,
  };
}

describe('previewKind', () => {
  it('classifies images, pdfs and others', () => {
    expect(previewKind('image/jpeg')).toBe('image');
    expect(previewKind('image/heic')).toBe('image');
    expect(previewKind('application/pdf')).toBe('pdf');
    expect(previewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('other');
  });
});

describe('issueOriginLabel', () => {
  it('maps each source to its badge', () => {
    expect(issueOriginLabel(PropertyIssueSource.INSPECTOR)).toBe('Inspector');
    expect(issueOriginLabel(PropertyIssueSource.STAFF)).toBe('Staff');
    expect(issueOriginLabel(PropertyIssueSource.RENTAL_TENANT_PORTAL)).toBe('Tenant');
  });
});

describe('groupNonIssueFiles', () => {
  it('splits by type, omits ISSUE files, and sorts newest-first', () => {
    const files = [
      file({ id: 'd1', type: PropertyFileType.DOCUMENT, createdAt: '2026-11-01T00:00:00.000Z' }),
      file({ id: 'd2', type: PropertyFileType.DOCUMENT, createdAt: '2026-11-03T00:00:00.000Z' }),
      file({ id: 'r1', type: PropertyFileType.REPORT }),
      file({ id: 'o1', type: PropertyFileType.OTHER }),
      file({ id: 'i1', type: PropertyFileType.ISSUE, mime: 'image/jpeg' }),
    ];
    const grouped = groupNonIssueFiles(files);
    expect(grouped.documents.map((f) => f.id)).toEqual(['d2', 'd1']); // newest first
    expect(grouped.reports.map((f) => f.id)).toEqual(['r1']);
    expect(grouped.other.map((f) => f.id)).toEqual(['o1']);
    // ISSUE files are not surfaced in the flat lists.
    expect([...grouped.documents, ...grouped.reports, ...grouped.other].some((f) => f.id === 'i1')).toBe(false);
  });
});

describe('sortIssuesNewestFirst', () => {
  it('orders issues newest-first without mutating the input', () => {
    const input = [
      issue({ id: 'a', createdAt: '2026-11-01T00:00:00.000Z' }),
      issue({ id: 'b', createdAt: '2026-11-05T00:00:00.000Z' }),
    ];
    const sorted = sortIssuesNewestFirst(input);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
    expect(input.map((i) => i.id)).toEqual(['a', 'b']); // not mutated
  });
});

describe('subtabCounts', () => {
  it('counts issues from the issue list and other types from the grouped files', () => {
    const issues = [issue({ id: 'x' }), issue({ id: 'y' })];
    const grouped = groupNonIssueFiles([
      file({ id: 'd1', type: PropertyFileType.DOCUMENT }),
      file({ id: 'r1', type: PropertyFileType.REPORT }),
    ]);
    expect(subtabCounts(issues, grouped)).toEqual({
      issues: 2,
      documents: 1,
      reports: 1,
      other: 0,
      total: 4,
    });
  });
});

describe('issuePhotosLabel', () => {
  it('returns "No photos" for an empty issue and null otherwise', () => {
    expect(issuePhotosLabel({ photos: [] })).toBe('No photos');
    expect(issuePhotosLabel({ photos: [file({ type: PropertyFileType.ISSUE })] })).toBeNull();
  });
});
