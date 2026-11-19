import { describe, it, expect } from 'vitest';
import { PropertyIssueSource } from '@properfy/shared';
import { issueSourceLabel, issueSeenStatus, ISSUE_NO_PHOTOS_TEXT } from './issue-format';

describe('issue-format helpers', () => {
  it('labels each source without exposing ids', () => {
    expect(issueSourceLabel(PropertyIssueSource.INSPECTOR)).toBe('Inspector');
    expect(issueSourceLabel(PropertyIssueSource.STAFF)).toBe('Staff');
    expect(issueSourceLabel(PropertyIssueSource.RENTAL_TENANT_PORTAL)).toBe('Tenant');
  });

  it('returns unseen status with empty label when not seen', () => {
    const status = issueSeenStatus({ seenAt: null, seenByUserId: null }, 'user-1');
    expect(status.seen).toBe(false);
    expect(status.label).toBe('');
  });

  it('formats a seen timestamp in the platform timezone (Sydney), not the browser tz', () => {
    // 2026-11-07T03:30:00Z == 14:30 (2:30 pm) in Australia/Sydney (AEDT, +11)
    const status = issueSeenStatus(
      { seenAt: '2026-11-07T03:30:00.000Z', seenByUserId: 'someone-else' },
      'user-1',
    );
    expect(status.seen).toBe(true);
    expect(status.label).toContain('Seen · ');
    expect(status.label).toContain('07/11/2026');
    expect(status.label).toContain('2:30 pm');
    expect(status.label).not.toContain('by you');
    // never leaks the user id
    expect(status.label).not.toContain('someone-else');
  });

  it('appends "by you" when the viewer marked it seen', () => {
    const status = issueSeenStatus(
      { seenAt: '2026-11-07T03:30:00.000Z', seenByUserId: 'user-1' },
      'user-1',
    );
    expect(status.label.endsWith('· by you')).toBe(true);
    expect(status.label).not.toContain('user-1');
  });

  it('exposes the no-photos text', () => {
    expect(ISSUE_NO_PHOTOS_TEXT).toBe('No photos');
  });
});
