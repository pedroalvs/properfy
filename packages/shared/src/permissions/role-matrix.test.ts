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

describe('contact.list', () => {
  it.each<UserRole>(['AM', 'OP', 'CL_ADMIN', 'CL_USER'])('allows %s', (role) => {
    expect(can(role, 'contact.list')).toBe(true);
  });

  it.each<UserRole>(['INSP'])('denies %s', (role) => {
    expect(can(role, 'contact.list')).toBe(false);
  });
});

describe('contact.create / update / deactivate', () => {
  it.each<UserRole>(['AM', 'OP', 'CL_ADMIN'])('allows %s', (role) => {
    expect(can(role, 'contact.create')).toBe(true);
    expect(can(role, 'contact.update')).toBe(true);
    expect(can(role, 'contact.deactivate')).toBe(true);
  });

  it.each<UserRole>(['CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'contact.create')).toBe(false);
    expect(can(role, 'contact.update')).toBe(false);
    expect(can(role, 'contact.deactivate')).toBe(false);
  });
});

describe('audit.view', () => {
  it.each<UserRole>(['AM', 'OP', 'CL_ADMIN'])('allows %s', (role) => {
    expect(can(role, 'audit.view')).toBe(true);
  });

  it.each<UserRole>(['CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'audit.view')).toBe(false);
  });
});

describe('appointment.bulk_resend_reminder (023 §FR-241)', () => {
  it.each<UserRole>(['AM', 'OP'])('allows %s', (role) => {
    expect(can(role, 'appointment.bulk_resend_reminder')).toBe(true);
  });

  it.each<UserRole>(['CL_ADMIN', 'CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'appointment.bulk_resend_reminder')).toBe(false);
  });
});
