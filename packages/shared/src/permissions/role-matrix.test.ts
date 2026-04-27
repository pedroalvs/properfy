import { describe, it, expect } from 'vitest';
import { can } from './role-matrix';
import type { UserRole } from '../enums/user';

describe('service_region.list', () => {
  it.each<UserRole>(['AM', 'OP', 'INSP'])('allows %s', (role) => {
    expect(can(role, 'service_region.list')).toBe(true);
  });

  it.each<UserRole>(['CL_ADMIN', 'CL_USER'])('denies %s', (role) => {
    expect(can(role, 'service_region.list')).toBe(false);
  });
});

describe('service_region.create / update / delete', () => {
  it.each<UserRole>(['AM', 'OP'])('allows %s', (role) => {
    expect(can(role, 'service_region.create')).toBe(true);
    expect(can(role, 'service_region.update')).toBe(true);
    expect(can(role, 'service_region.delete')).toBe(true);
  });

  it.each<UserRole>(['CL_ADMIN', 'CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'service_region.create')).toBe(false);
    expect(can(role, 'service_region.update')).toBe(false);
    expect(can(role, 'service_region.delete')).toBe(false);
  });
});

describe('service_region.resolve', () => {
  it.each<UserRole>(['AM', 'OP'])('allows %s', (role) => {
    expect(can(role, 'service_region.resolve')).toBe(true);
  });

  it.each<UserRole>(['CL_ADMIN', 'CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'service_region.resolve')).toBe(false);
  });
});
