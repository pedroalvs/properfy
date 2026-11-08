import { describe, it, expect } from 'vitest';
import type { PropertyFileResponse } from '@properfy/shared';
import { groupLatestVersions, versionsForGroup, hasMultipleVersions } from './file-versions';

function file(id: string, versionGroupId: string, version: number): PropertyFileResponse {
  return {
    id,
    propertyId: 'p',
    appointmentId: null,
    issueId: null,
    type: 'DOCUMENT' as PropertyFileResponse['type'],
    versionGroupId,
    version,
    fileName: `${id}.pdf`,
    mime: 'application/pdf',
    sizeBytes: 1,
    status: 'READY' as PropertyFileResponse['status'],
    uploadedByUserId: null,
    createdAt: '2026-11-07T00:00:00Z',
  };
}

describe('file-versions', () => {
  const rows = [
    file('a1', 'A', 1),
    file('b1', 'B', 1),
    file('a2', 'A', 2),
    file('a3', 'A', 3),
  ];

  it('collapses to the latest version per group, preserving first-seen order', () => {
    const latest = groupLatestVersions(rows);
    expect(latest.map((f) => f.id)).toEqual(['a3', 'b1']);
    expect(latest.map((f) => f.versionGroupId)).toEqual(['A', 'B']);
  });

  it('expands a group newest-first', () => {
    expect(versionsForGroup(rows, 'A').map((f) => f.version)).toEqual([3, 2, 1]);
    expect(versionsForGroup(rows, 'B').map((f) => f.version)).toEqual([1]);
  });

  it('detects multi-version groups', () => {
    expect(hasMultipleVersions(rows, 'A')).toBe(true);
    expect(hasMultipleVersions(rows, 'B')).toBe(false);
  });
});
