import { describe, it, expect } from 'vitest';
import { canPerform, getRoleCapabilities } from './permissions';

describe('canPerform', () => {
  it('returns false for a missing role', () => {
    expect(canPerform(null, 'user.list')).toBe(false);
    expect(canPerform(undefined, 'user.list')).toBe(false);
  });

  it('reflects the shared matrix for a known action', () => {
    expect(canPerform('AM', 'user.create_internal')).toBe(true);
    expect(canPerform('CL_ADMIN', 'user.create_internal')).toBe(false);
  });
});

describe('getRoleCapabilities', () => {
  it('returns an empty list for a missing role', () => {
    expect(getRoleCapabilities(null)).toEqual([]);
    expect(getRoleCapabilities(undefined)).toEqual([]);
  });

  it('formats role-permitted actions as "Domain: verb" labels, sorted', () => {
    const caps = getRoleCapabilities('AM');
    expect(caps.length).toBeGreaterThan(0);
    // AM is granted user.create_internal by the shared matrix.
    expect(caps).toContain('User: create internal');
    // Sorted ascending.
    expect([...caps]).toEqual([...caps].sort());
  });

  it('grants fewer capabilities to a narrower role than to AM', () => {
    expect(getRoleCapabilities('CL_USER').length).toBeLessThan(
      getRoleCapabilities('AM').length,
    );
  });
});
