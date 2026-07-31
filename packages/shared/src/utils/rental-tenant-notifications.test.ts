import { describe, it, expect } from 'vitest';
import {
  isRentalTenantNotificationsEnabled,
  RENTAL_TENANT_NOTIFICATIONS_SETTING_KEY,
  TENANT_NOTIFICATIONS_BLOCKED_CODE,
} from './rental-tenant-notifications';

describe('isRentalTenantNotificationsEnabled', () => {
  it('is enabled when the key is absent', () => {
    // The load-bearing case: agencies that never touched the setting must keep
    // receiving tenant notifications, and every migrated row lands here.
    expect(isRentalTenantNotificationsEnabled({})).toBe(true);
  });

  it('is enabled when explicitly true', () => {
    expect(isRentalTenantNotificationsEnabled({ rentalTenantNotificationsEnabled: true })).toBe(true);
  });

  it('is disabled only when explicitly false', () => {
    expect(isRentalTenantNotificationsEnabled({ rentalTenantNotificationsEnabled: false })).toBe(false);
  });

  it('is enabled when the settings blob is missing entirely', () => {
    // Tenant rows persisted before settings_json had a default carry no blob; an
    // unguarded read here used to be a 500 on every Send Portal Link.
    expect(isRentalTenantNotificationsEnabled(undefined)).toBe(true);
    expect(isRentalTenantNotificationsEnabled(null)).toBe(true);
  });

  it('does not treat a falsy-but-not-false value as disabled', () => {
    // Guards against a future `!settings[key]` regression: only an explicit `false`
    // is an opt-out, so a stray null/0/"" must not silence an agency's tenants.
    expect(isRentalTenantNotificationsEnabled({ rentalTenantNotificationsEnabled: null })).toBe(true);
    expect(isRentalTenantNotificationsEnabled({ rentalTenantNotificationsEnabled: 0 })).toBe(true);
    expect(isRentalTenantNotificationsEnabled({ rentalTenantNotificationsEnabled: '' })).toBe(true);
  });

  it('does not treat the string "false" as disabled', () => {
    // settings_json is jsonb, so a boolean stays a boolean; a string here means the
    // writer is wrong and should be visible rather than silently honoured.
    expect(isRentalTenantNotificationsEnabled({ rentalTenantNotificationsEnabled: 'false' })).toBe(true);
  });

  it('exposes the setting key so the literal has one definition', () => {
    expect(RENTAL_TENANT_NOTIFICATIONS_SETTING_KEY).toBe('rentalTenantNotificationsEnabled');
  });

  it('exposes the blocked error code shared by backend throw, batch guards and web', () => {
    expect(TENANT_NOTIFICATIONS_BLOCKED_CODE).toBe('TENANT_NOTIFICATIONS_BLOCKED');
  });
});
