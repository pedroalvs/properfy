import { describe, it, expect } from 'vitest';
import { TenantStatus, BranchStatus } from './tenant';

describe('TenantStatus', () => {
  it('should have PENDING, ACTIVE, INACTIVE values', () => {
    expect(TenantStatus.PENDING).toBe('PENDING');
    expect(TenantStatus.ACTIVE).toBe('ACTIVE');
    expect(TenantStatus.INACTIVE).toBe('INACTIVE');
  });

  it('should have exactly 3 statuses', () => {
    expect(Object.keys(TenantStatus)).toHaveLength(3);
  });
});

describe('BranchStatus', () => {
  it('should have ACTIVE, INACTIVE values', () => {
    expect(BranchStatus.ACTIVE).toBe('ACTIVE');
    expect(BranchStatus.INACTIVE).toBe('INACTIVE');
  });

  it('should have exactly 2 statuses', () => {
    expect(Object.keys(BranchStatus)).toHaveLength(2);
  });
});
