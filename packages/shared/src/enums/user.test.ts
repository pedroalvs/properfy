import { describe, it, expect } from 'vitest';
import { UserRole, UserStatus } from './user';

describe('UserRole', () => {
  it('should have all expected values', () => {
    expect(UserRole.AM).toBe('AM');
    expect(UserRole.OP).toBe('OP');
    expect(UserRole.CL_ADMIN).toBe('CL_ADMIN');
    expect(UserRole.CL_USER).toBe('CL_USER');
    expect(UserRole.INSP).toBe('INSP');
  });

  it('should have exactly 6 roles', () => {
    expect(Object.keys(UserRole)).toHaveLength(6);
  });

  it('should include TNT role', () => {
    expect(UserRole.TNT).toBe('TNT');
  });
});

describe('UserStatus', () => {
  it('should have ACTIVE, INACTIVE, LOCKED', () => {
    expect(UserStatus.ACTIVE).toBe('ACTIVE');
    expect(UserStatus.INACTIVE).toBe('INACTIVE');
    expect(UserStatus.LOCKED).toBe('LOCKED');
  });
});
