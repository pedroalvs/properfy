import { describe, it, expect } from 'vitest';
import { VALID_TRANSITIONS } from './status-transitions';
import { AppointmentStatus } from '../enums/appointment';

describe('VALID_TRANSITIONS', () => {
  it('should define transitions for all statuses', () => {
    const allStatuses = Object.values(AppointmentStatus);
    for (const status of allStatuses) {
      expect(VALID_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('DRAFT can transition to AWAITING_INSPECTOR, REJECTED, CANCELLED', () => {
    expect(VALID_TRANSITIONS.DRAFT).toContain('AWAITING_INSPECTOR');
    expect(VALID_TRANSITIONS.DRAFT).toContain('REJECTED');
    expect(VALID_TRANSITIONS.DRAFT).toContain('CANCELLED');
  });

  it('AWAITING_INSPECTOR can transition to SCHEDULED, CANCELLED, REJECTED', () => {
    expect(VALID_TRANSITIONS.AWAITING_INSPECTOR).toContain('SCHEDULED');
    expect(VALID_TRANSITIONS.AWAITING_INSPECTOR).toContain('CANCELLED');
    expect(VALID_TRANSITIONS.AWAITING_INSPECTOR).toContain('REJECTED');
  });

  it('SCHEDULED can transition to DONE, CANCELLED, REJECTED', () => {
    expect(VALID_TRANSITIONS.SCHEDULED).toContain('DONE');
    expect(VALID_TRANSITIONS.SCHEDULED).toContain('CANCELLED');
    expect(VALID_TRANSITIONS.SCHEDULED).toContain('REJECTED');
  });

  it('DONE can only transition back to DRAFT', () => {
    expect(VALID_TRANSITIONS.DONE).toEqual(['DRAFT']);
  });

  it('CANCELLED can only transition back to DRAFT', () => {
    expect(VALID_TRANSITIONS.CANCELLED).toEqual(['DRAFT']);
  });

  it('REJECTED can only transition back to DRAFT', () => {
    expect(VALID_TRANSITIONS.REJECTED).toEqual(['DRAFT']);
  });
});
