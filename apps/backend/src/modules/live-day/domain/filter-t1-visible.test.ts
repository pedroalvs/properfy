import { describe, it, expect } from 'vitest';
import { filterT1Visible } from './filter-t1-visible';
import { makeStopRow } from './live-day-test-factories';

describe('filterT1Visible (L-F05-03)', () => {
  const today = '2026-11-05';
  const tomorrow = '2026-11-06';

  it('keeps an INGOING SCHEDULED stop and drops a ROUTINE unconfirmed one for tomorrow', () => {
    const rows = [
      makeStopRow({
        appointmentId: 'A',
        flowType: 'INGOING',
        status: 'SCHEDULED',
        scheduledDate: tomorrow,
        confirmationStatus: 'PENDING',
      }),
      makeStopRow({
        appointmentId: 'B',
        flowType: 'ROUTINE',
        status: 'SCHEDULED',
        scheduledDate: tomorrow,
        confirmationStatus: 'PENDING',
        keyRequired: false,
        requiresRentalTenantConfirmation: true,
      }),
    ];
    expect(filterT1Visible(rows, today).map((r) => r.appointmentId)).toEqual(['A']);
  });

  it('keeps a ROUTINE stop once it is CONFIRMED', () => {
    const rows = [
      makeStopRow({
        appointmentId: 'B',
        flowType: 'ROUTINE',
        status: 'SCHEDULED',
        scheduledDate: tomorrow,
        confirmationStatus: 'CONFIRMED',
      }),
    ];
    expect(filterT1Visible(rows, today).map((r) => r.appointmentId)).toEqual(['B']);
  });

  it('keeps a key-required ROUTINE stop even when unconfirmed', () => {
    const rows = [
      makeStopRow({
        appointmentId: 'B',
        flowType: 'ROUTINE',
        status: 'SCHEDULED',
        scheduledDate: tomorrow,
        confirmationStatus: 'PENDING',
        keyRequired: true,
      }),
    ];
    expect(filterT1Visible(rows, today)).toHaveLength(1);
  });

  it('always keeps DONE stops, even a ROUTINE unconfirmed one', () => {
    const rows = [
      makeStopRow({
        appointmentId: 'B',
        flowType: 'ROUTINE',
        status: 'DONE',
        scheduledDate: tomorrow,
        confirmationStatus: 'PENDING',
      }),
    ];
    expect(filterT1Visible(rows, today)).toHaveLength(1);
  });

  it('drops an UNAVAILABLE ROUTINE stop', () => {
    const rows = [
      makeStopRow({
        appointmentId: 'B',
        flowType: 'ROUTINE',
        status: 'SCHEDULED',
        scheduledDate: tomorrow,
        confirmationStatus: 'UNAVAILABLE',
      }),
    ];
    expect(filterT1Visible(rows, today)).toHaveLength(0);
  });

  it('keeps a ROUTINE unconfirmed stop more than one day out (not yet in the T-1 window)', () => {
    const rows = [
      makeStopRow({
        appointmentId: 'B',
        flowType: 'ROUTINE',
        status: 'SCHEDULED',
        scheduledDate: '2026-11-10',
        confirmationStatus: 'PENDING',
      }),
    ];
    expect(filterT1Visible(rows, today)).toHaveLength(1);
  });
});
