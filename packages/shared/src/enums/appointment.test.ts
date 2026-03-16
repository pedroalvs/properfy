import { describe, it, expect } from 'vitest';
import { AppointmentStatus, TenantConfirmationStatus } from './appointment';

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

describe('TenantConfirmationStatus', () => {
  it('should have all expected values', () => {
    expect(TenantConfirmationStatus.PENDING).toBe('PENDING');
    expect(TenantConfirmationStatus.CONFIRMED).toBe('CONFIRMED');
    expect(TenantConfirmationStatus.UNAVAILABLE).toBe('UNAVAILABLE');
    expect(TenantConfirmationStatus.NO_RESPONSE).toBe('NO_RESPONSE');
  });
});
