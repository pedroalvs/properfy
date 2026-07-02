import { describe, it, expect } from 'vitest';
import { ImportStatus } from './import';

describe('ImportStatus', () => {
  it('has all required statuses', () => {
    expect(ImportStatus.PENDING).toBe('PENDING');
    expect(ImportStatus.PROCESSING).toBe('PROCESSING');
    expect(ImportStatus.COMPLETED).toBe('COMPLETED');
    expect(ImportStatus.FAILED).toBe('FAILED');
  });

  // PREVIEW is appointment-import-specific (the new preview/commit split) — a
  // record sits in PREVIEW after the synchronous preview and before commit is
  // requested. Property import never assigns it; sharing the enum avoids a
  // parallel per-domain status type.
  it('has a PREVIEW status for the preview/commit split', () => {
    expect(ImportStatus.PREVIEW).toBe('PREVIEW');
  });

  it('has exactly 5 values', () => {
    expect(Object.keys(ImportStatus)).toHaveLength(5);
  });
});
