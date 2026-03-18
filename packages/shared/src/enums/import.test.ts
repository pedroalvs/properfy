import { describe, it, expect } from 'vitest';
import { ImportStatus } from './import';

describe('ImportStatus', () => {
  it('has all required statuses', () => {
    expect(ImportStatus.PENDING).toBe('PENDING');
    expect(ImportStatus.PROCESSING).toBe('PROCESSING');
    expect(ImportStatus.COMPLETED).toBe('COMPLETED');
    expect(ImportStatus.FAILED).toBe('FAILED');
  });

  it('has exactly 4 values', () => {
    expect(Object.keys(ImportStatus)).toHaveLength(4);
  });
});
