import { describe, it, expect } from 'vitest';
import {
  APPOINTMENT_STATUS_LABELS,
  AppointmentStatus,
  RentalTenantConfirmationStatus,
  RestrictionSource,
  TERMINAL_APPOINTMENT_STATUSES,
  isTerminalAppointmentStatus,
} from './appointment';

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

describe('APPOINTMENT_STATUS_LABELS', () => {
  it('labels every status', () => {
    expect(Object.keys(APPOINTMENT_STATUS_LABELS).sort()).toEqual(
      Object.keys(AppointmentStatus).sort(),
    );
  });

  // Pinned exhaustively: these strings reach operators verbatim in API error
  // messages and status chips, so a typo in any one of them is user-visible.
  it('reads as prose rather than as the raw enum', () => {
    expect(APPOINTMENT_STATUS_LABELS).toEqual({
      DRAFT: 'Draft',
      AWAITING_INSPECTOR: 'Awaiting Inspector',
      SCHEDULED: 'Scheduled',
      DONE: 'Done',
      CANCELLED: 'Cancelled',
      REJECTED: 'Rejected',
    });
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

describe('TERMINAL_APPOINTMENT_STATUSES', () => {
  it('covers exactly the statuses whose schedule can no longer move', () => {
    expect([...TERMINAL_APPOINTMENT_STATUSES].sort()).toEqual(['CANCELLED', 'DONE', 'REJECTED']);
  });

  it.each(['DONE', 'CANCELLED', 'REJECTED'])('treats %s as terminal', (status) => {
    expect(isTerminalAppointmentStatus(status)).toBe(true);
  });

  it.each(['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED'])('treats %s as still movable', (status) => {
    expect(isTerminalAppointmentStatus(status)).toBe(false);
  });

  it('does not throw on an unknown status', () => {
    expect(isTerminalAppointmentStatus('NOT_A_STATUS')).toBe(false);
  });
});
