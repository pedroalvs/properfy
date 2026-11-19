import { describe, it, expect } from 'vitest';
import { DEFAULT_PROPERTY_FILES_SETTING } from '@properfy/shared';
import {
  ISSUE_PHOTO_ACCEPT,
  MAX_ISSUE_PHOTOS,
  checkIssuePhoto,
  photoRejectionMessage,
  canAddMorePhotos,
} from '../issue-photo-validation';

describe('issue-photo-validation', () => {
  it('derives the accept list and photo cap from the shared defaults', () => {
    expect(ISSUE_PHOTO_ACCEPT).toBe(DEFAULT_PROPERTY_FILES_SETTING.issueImageMimes.join(','));
    expect(MAX_ISSUE_PHOTOS).toBe(DEFAULT_PROPERTY_FILES_SETTING.maxPhotosPerIssue);
    expect(ISSUE_PHOTO_ACCEPT).toContain('image/jpeg');
    expect(ISSUE_PHOTO_ACCEPT).not.toContain('application/pdf');
  });

  it('accepts an in-limit image', () => {
    expect(checkIssuePhoto({ type: 'image/jpeg', size: 1_000_000 })).toBeNull();
    expect(checkIssuePhoto({ type: 'image/heic', size: 1_000_000 })).toBeNull();
  });

  it('rejects a non-image type', () => {
    expect(checkIssuePhoto({ type: 'application/pdf', size: 1000 })).toBe('type');
    expect(photoRejectionMessage('type')).toMatch(/image files/i);
  });

  it('allows an empty-type file through to the backend (e.g. HEIC via the iOS Files app)', () => {
    expect(checkIssuePhoto({ type: '', size: 1_000_000 })).toBeNull();
    // but the size guard still applies to an empty-type file
    const over = (DEFAULT_PROPERTY_FILES_SETTING.maxFileSizeMb + 1) * 1024 * 1024;
    expect(checkIssuePhoto({ type: '', size: over })).toBe('size');
  });

  it('rejects an oversize image against the default limit', () => {
    const over = (DEFAULT_PROPERTY_FILES_SETTING.maxFileSizeMb + 1) * 1024 * 1024;
    expect(checkIssuePhoto({ type: 'image/png', size: over })).toBe('size');
    expect(photoRejectionMessage('size')).toMatch(/under \d+ MB/i);
  });

  it('caps the number of photos', () => {
    expect(canAddMorePhotos(MAX_ISSUE_PHOTOS - 1)).toBe(true);
    expect(canAddMorePhotos(MAX_ISSUE_PHOTOS)).toBe(false);
  });
});
