import { describe, it, expect } from 'vitest';
import { can, getMatrixEntry } from './role-matrix';
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

describe('appointment.import', () => {
  it.each<UserRole>(['AM', 'OP', 'CL_ADMIN'])('allows %s', (role) => {
    expect(can(role, 'appointment.import')).toBe(true);
  });

  it.each<UserRole>(['CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'appointment.import')).toBe(false);
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

describe('appointment.bulk_cancel (025 §FR-411)', () => {
  // CL_USER is in the base list but gated by `cancel_appointments` flag at runtime.
  // `can()` returns the base permission only.
  it.each<UserRole>(['AM', 'OP', 'CL_ADMIN', 'CL_USER'])('allows %s (base)', (role) => {
    expect(can(role, 'appointment.bulk_cancel')).toBe(true);
  });

  it.each<UserRole>(['INSP'])('denies %s', (role) => {
    expect(can(role, 'appointment.bulk_cancel')).toBe(false);
  });
});

describe('appointment.bulk_reschedule (025 §FR-421)', () => {
  it.each<UserRole>(['AM', 'OP', 'CL_ADMIN', 'CL_USER'])('allows %s (base)', (role) => {
    expect(can(role, 'appointment.bulk_reschedule')).toBe(true);
  });

  it.each<UserRole>(['INSP'])('denies %s', (role) => {
    expect(can(role, 'appointment.bulk_reschedule')).toBe(false);
  });
});

describe('appointment.bulk_status_transition (025 §FR-431)', () => {
  it.each<UserRole>(['AM', 'OP'])('allows %s', (role) => {
    expect(can(role, 'appointment.bulk_status_transition')).toBe(true);
  });

  it.each<UserRole>(['CL_ADMIN', 'CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'appointment.bulk_status_transition')).toBe(false);
  });
});

describe('appointment.bulk_assign_inspector (025 §FR-441)', () => {
  it.each<UserRole>(['AM', 'OP'])('allows %s', (role) => {
    expect(can(role, 'appointment.bulk_assign_inspector')).toBe(true);
  });

  it.each<UserRole>(['CL_ADMIN', 'CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'appointment.bulk_assign_inspector')).toBe(false);
  });
});

describe('appointment.add_to_group (026 §FR-510)', () => {
  it.each<UserRole>(['AM', 'OP'])('allows %s', (role) => {
    expect(can(role, 'appointment.add_to_group')).toBe(true);
  });

  it.each<UserRole>(['CL_ADMIN', 'CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'appointment.add_to_group')).toBe(false);
  });
});

describe('appointment.bulk_reopen_for_reschedule (026 §FR-540, matriz 2.2)', () => {
  it.each<UserRole>(['AM', 'OP', 'CL_ADMIN'])('allows %s', (role) => {
    expect(can(role, 'appointment.bulk_reopen_for_reschedule')).toBe(true);
  });

  it.each<UserRole>(['CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'appointment.bulk_reopen_for_reschedule')).toBe(false);
  });
});

// 031 Financial scope alignment — Agency read surfaces.
// AM/OP (platform) + CL_ADMIN (own agency) unconditionally; CL_USER is in the
// base list but gated by the `view_financials` cl_user_flag at runtime.
describe('financial.agency_view (031)', () => {
  it.each<UserRole>(['AM', 'OP', 'CL_ADMIN', 'CL_USER'])('allows %s (base)', (role) => {
    expect(can(role, 'financial.agency_view')).toBe(true);
  });

  it.each<UserRole>(['INSP', 'TNT'])('denies %s', (role) => {
    expect(can(role, 'financial.agency_view')).toBe(false);
  });

  it('is gated by the view_financials cl_user_flag', () => {
    const entry = getMatrixEntry('financial.agency_view');
    expect(entry?.condition).toBe('cl_user_flag');
    expect(entry?.conditionKey).toBe('view_financials');
  });
});

describe('financial.agency_export (031)', () => {
  it.each<UserRole>(['AM', 'OP', 'CL_ADMIN', 'CL_USER'])('allows %s (base)', (role) => {
    expect(can(role, 'financial.agency_export')).toBe(true);
  });

  it.each<UserRole>(['INSP', 'TNT'])('denies %s', (role) => {
    expect(can(role, 'financial.agency_export')).toBe(false);
  });

  it('is gated by the view_financials cl_user_flag', () => {
    const entry = getMatrixEntry('financial.agency_export');
    expect(entry?.condition).toBe('cl_user_flag');
    expect(entry?.conditionKey).toBe('view_financials');
  });
});

// Backoffice financial actions stay AM/OP-only (unchanged by 031).
describe('financial.view / approve (backoffice, unchanged)', () => {
  it.each<UserRole>(['AM', 'OP'])('allows %s', (role) => {
    expect(can(role, 'financial.view')).toBe(true);
    expect(can(role, 'financial.approve')).toBe(true);
  });

  it.each<UserRole>(['CL_ADMIN', 'CL_USER', 'INSP'])('denies %s', (role) => {
    expect(can(role, 'financial.view')).toBe(false);
    expect(can(role, 'financial.approve')).toBe(false);
  });
});
