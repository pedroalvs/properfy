import { describe, it, expect } from 'vitest';
import { AppointmentStatus, RentalTenantConfirmationStatus, RestrictionSource } from './appointment';

describe('AppointmentStatus', () => {
  it('should have all expected values', () => {
    expect(AppointmentStatus.DRAFT).toBe('DRAFT');
    expect(AppointmentStatus.AWAITING_INSPECTOR).toBe('AWAITING_INSPECTOR');
    expect(AppointmentStatus.SCHEDULED).toBe('SCHEDULED');
    expect(AppointmentStatus.DONE).toBe('DONE');
    expect(AppointmentStatus.CANCELLED).toBe('CANCELLED');
    expect(AppointmentStatus.REJECTED).toBe('REJECTED');
  });

  it('should have exactly 6 values', () => {
    expect(Object.keys(AppointmentStatus)).toHaveLength(6);
  });
});

describe('RentalTenantConfirmationStatus', () => {
  it('should have all expected values', () => {
    expect(RentalTenantConfirmationStatus.PENDING).toBe('PENDING');
    expect(RentalTenantConfirmationStatus.CONFIRMED).toBe('CONFIRMED');
    expect(RentalTenantConfirmationStatus.UNAVAILABLE).toBe('UNAVAILABLE');
    expect(RentalTenantConfirmationStatus.NO_RESPONSE).toBe('NO_RESPONSE');
  });
});

describe('RestrictionSource', () => {
  it('should have all expected values', () => {
    expect(RestrictionSource.RENTAL_TENANT_PORTAL).toBe('RENTAL_TENANT_PORTAL');
    expect(RestrictionSource.OPERATOR).toBe('OPERATOR');
    expect(RestrictionSource.IMPORT).toBe('IMPORT');
  });

  it('should have exactly 3 values', () => {
    expect(Object.keys(RestrictionSource)).toHaveLength(3);
  });
});
