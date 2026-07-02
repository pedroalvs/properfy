import { describe, it, expect } from 'vitest';
import { UserRole, UserStatus, CL_USER_PERMISSIONS } from './user';

describe('UserRole', () => {
  it('should have all expected values', () => {
    expect(UserRole.AM).toBe('AM');
    expect(UserRole.OP).toBe('OP');
    expect(UserRole.CL_ADMIN).toBe('CL_ADMIN');
    expect(UserRole.CL_USER).toBe('CL_USER');
    expect(UserRole.INSP).toBe('INSP');
  });

  it('should have exactly 7 roles', () => {
    expect(Object.keys(UserRole)).toHaveLength(7);
  });

  it('should include TNT role', () => {
    expect(UserRole.TNT).toBe('TNT');
  });

  it('should include SYS role', () => {
    expect(UserRole.SYS).toBe('SYS');
  });
});

describe('UserStatus', () => {
  it('should have ACTIVE, INACTIVE, LOCKED', () => {
    expect(UserStatus.ACTIVE).toBe('ACTIVE');
    expect(UserStatus.INACTIVE).toBe('INACTIVE');
    expect(UserStatus.LOCKED).toBe('LOCKED');
  });
});

describe('CL_USER_PERMISSIONS (031)', () => {
  it('includes the configurable view_financials flag', () => {
    expect(CL_USER_PERMISSIONS).toContain('view_financials');
  });

  it('retains the existing operational permissions', () => {
    expect(CL_USER_PERMISSIONS).toContain('create_appointments');
    expect(CL_USER_PERMISSIONS).toContain('reschedule_appointments');
  });
});
