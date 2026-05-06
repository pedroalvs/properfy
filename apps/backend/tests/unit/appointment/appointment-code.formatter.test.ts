import { describe, it, expect } from 'vitest';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';

const formatter = new AppointmentCodeFormatter();

function makeTenant(settingsJson: Record<string, unknown> = {}) {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('AppointmentCodeFormatter', () => {
  it('uses default prefix INS when no appointmentCodePrefix in settings', () => {
    expect(formatter.format(1, makeTenant())).toBe('INS-0001');
  });

  it('uses custom prefix from tenant settings', () => {
    expect(formatter.format(42, makeTenant({ appointmentCodePrefix: 'APT' }))).toBe('APT-0042');
  });

  it('falls back to INS when appointmentCodePrefix is empty string', () => {
    expect(formatter.format(5, makeTenant({ appointmentCodePrefix: '' }))).toBe('INS-0005');
  });

  it('falls back to INS when appointmentCodePrefix is not a string', () => {
    expect(formatter.format(5, makeTenant({ appointmentCodePrefix: 123 }))).toBe('INS-0005');
  });

  it('pads single-digit number to 4 digits', () => {
    expect(formatter.format(1, makeTenant())).toBe('INS-0001');
  });

  it('pads two-digit number to 4 digits', () => {
    expect(formatter.format(99, makeTenant())).toBe('INS-0099');
  });

  it('handles 4-digit number without padding', () => {
    expect(formatter.format(9999, makeTenant())).toBe('INS-9999');
  });

  it('handles appointment number 0', () => {
    expect(formatter.format(0, makeTenant())).toBe('INS-0000');
  });

  it('handles appointment number 1000', () => {
    expect(formatter.format(1000, makeTenant())).toBe('INS-1000');
  });
});
