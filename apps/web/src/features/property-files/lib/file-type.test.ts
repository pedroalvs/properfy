import { describe, it, expect } from 'vitest';
import { PropertyFileType } from '@properfy/shared';
import {
  FILE_SUBTABS,
  SUBTAB_TO_TYPE,
  TYPE_TO_SUBTAB,
  isSubtab,
  isImageMime,
  isHeicMime,
  isPdfMime,
  canPreviewInline,
  humanizeSize,
} from './file-type';

describe('file-type helpers', () => {
  it('orders subtabs with issues first', () => {
    expect(FILE_SUBTABS[0]).toBe('issues');
    expect(FILE_SUBTABS).toEqual(['issues', 'documents', 'reports', 'other']);
  });

  it('maps subtab <-> PropertyFileType both ways', () => {
    expect(SUBTAB_TO_TYPE.issues).toBe(PropertyFileType.ISSUE);
    expect(SUBTAB_TO_TYPE.documents).toBe(PropertyFileType.DOCUMENT);
    expect(TYPE_TO_SUBTAB[PropertyFileType.REPORT]).toBe('reports');
    expect(TYPE_TO_SUBTAB[PropertyFileType.OTHER]).toBe('other');
    // round-trips
    for (const sub of FILE_SUBTABS) {
      expect(TYPE_TO_SUBTAB[SUBTAB_TO_TYPE[sub]]).toBe(sub);
    }
  });

  it('isSubtab guards unknown values', () => {
    expect(isSubtab('issues')).toBe(true);
    expect(isSubtab('nope')).toBe(false);
  });

  it('classifies mimes', () => {
    expect(isImageMime('image/jpeg')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
    expect(isHeicMime('image/heic')).toBe(true);
    expect(isHeicMime('image/heif')).toBe(true);
    expect(isHeicMime('image/png')).toBe(false);
    expect(isPdfMime('application/pdf')).toBe(true);
  });

  it('canPreviewInline is true for renderable images, false for HEIC and PDF', () => {
    expect(canPreviewInline('image/png')).toBe(true);
    expect(canPreviewInline('image/webp')).toBe(true);
    expect(canPreviewInline('image/heic')).toBe(false);
    expect(canPreviewInline('application/pdf')).toBe(false);
  });

  it('humanizes byte sizes', () => {
    expect(humanizeSize(0)).toBe('0 B');
    expect(humanizeSize(-5)).toBe('0 B');
    expect(humanizeSize(512)).toBe('512 B');
    expect(humanizeSize(1024)).toBe('1 KB');
    expect(humanizeSize(1536)).toBe('1.5 KB');
    expect(humanizeSize(20 * 1024 * 1024)).toBe('20 MB');
  });
});
