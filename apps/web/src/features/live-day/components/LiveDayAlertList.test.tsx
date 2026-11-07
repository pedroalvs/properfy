import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LiveDayAlert, LiveDayStop } from '@properfy/shared';
import { LiveDayAlertList } from './LiveDayAlertList';

function alert(over: Partial<LiveDayAlert>): LiveDayAlert {
  return {
    type: 'DELAY',
    occurredAt: '2026-11-05T10:00:00+11:00',
    appointmentId: null,
    appointmentCode: null,
    minutes: null,
    estimatedArrivalAt: null,
    thresholdMinutes: null,
    thresholdSource: null,
    reason: null,
    reasonLabel: null,
    note: null,
    phase: null,
    distanceMeters: null,
    radiusMeters: null,
    ...over,
  } as LiveDayAlert;
}

function stop(appointmentId: string, timezone = 'Australia/Sydney'): LiveDayStop {
  return { appointmentId, timezone } as unknown as LiveDayStop;
}

function renderList(alerts: LiveDayAlert[], stops: LiveDayStop[] = [], isPastDay = false) {
  return render(
    <MemoryRouter>
      <LiveDayAlertList alerts={alerts} stops={stops} fallbackTimezone="Australia/Sydney" isPastDay={isPastDay} />
    </MemoryRouter>,
  );
}

function liText() {
  return screen.getByRole('listitem').textContent;
}

describe('LiveDayAlertList', () => {
  it('DELAY (platform) and the custom override', () => {
    renderList([alert({ type: 'DELAY', minutes: 22, thresholdMinutes: 20, thresholdSource: 'PLATFORM' })]);
    expect(liText()).toBe('Running 22 min late (limit 20 min)');

    renderList([alert({ type: 'DELAY', minutes: 22, thresholdMinutes: 15, thresholdSource: 'INSPECTOR' })]);
    expect(screen.getAllByRole('listitem')[1]!.textContent).toBe('Running 22 min late (limit 15 min, custom)');
  });

  it('NOT_STARTED today → due + "N min ago", with a code link', () => {
    renderList(
      [
        alert({
          type: 'NOT_STARTED',
          appointmentId: 'A',
          appointmentCode: 'INS-0044',
          occurredAt: '2026-11-05T10:30:00+11:00',
          thresholdMinutes: 30,
          minutes: 240,
        }),
      ],
      [stop('A')],
    );
    expect(liText()).toBe('INS-0044 not started — due at 10:00 am (240 min ago)');
    expect(screen.getByRole('link', { name: 'INS-0044' })).toHaveAttribute('href', '/appointments/A');
  });

  it('NOT_STARTED on a past day drops "N min ago" (L-F05-02)', () => {
    renderList(
      [
        alert({
          type: 'NOT_STARTED',
          appointmentId: 'A',
          appointmentCode: 'INS-0044',
          occurredAt: '2026-11-05T10:30:00+11:00',
          thresholdMinutes: 30,
          minutes: 420,
        }),
      ],
      [stop('A')],
      true,
    );
    expect(liText()).toBe('INS-0044 not started that day (due at 10:00 am)');
  });

  it('OUT_OF_WINDOW with and without tolerance (L-F05-11)', () => {
    renderList(
      [alert({ type: 'OUT_OF_WINDOW', appointmentId: 'B', appointmentCode: 'INS-0043', minutes: 25, thresholdMinutes: 15 })],
      [stop('B')],
    );
    expect(liText()).toBe('Checked in outside the window for INS-0043 (25 min off, tolerance 15 min)');

    renderList(
      [alert({ type: 'OUT_OF_WINDOW', appointmentId: 'B', appointmentCode: 'INS-0043', minutes: 10, thresholdMinutes: null })],
      [stop('B')],
    );
    expect(screen.getAllByRole('listitem')[1]!.textContent).toBe('Checked in outside the window for INS-0043 (10 min off)');
  });

  it('LATE_NOTICE uses the server estimatedArrivalAt in the stop timezone (L-F03-04)', () => {
    renderList(
      [
        alert({
          type: 'LATE_NOTICE',
          appointmentId: 'A',
          appointmentCode: 'INS-0044',
          estimatedArrivalAt: '2026-11-05T09:20:00+11:00',
          minutes: 20,
          reasonLabel: 'Traffic',
        }),
      ],
      [stop('A')],
    );
    expect(liText()).toBe("Said they'd arrive around 9:20 am (20 min late): Traffic · INS-0044");
  });

  it('LATE_NOTICE formats in the stop timezone (Perth)', () => {
    renderList(
      [
        alert({
          type: 'LATE_NOTICE',
          appointmentId: 'P',
          appointmentCode: 'INS-9',
          estimatedArrivalAt: '2026-11-05T00:20:00Z',
          minutes: 20,
          reasonLabel: 'Traffic',
        }),
      ],
      [stop('P', 'Australia/Perth')],
    );
    // 00:20Z → 08:20 Perth.
    expect(liText()).toBe("Said they'd arrive around 8:20 am (20 min late): Traffic · INS-9");
  });

  it('CANT_DO with a note, code links even though it is not a current stop', () => {
    renderList([
      alert({
        type: 'CANT_DO',
        appointmentId: 'X',
        appointmentCode: 'INS-0045',
        reasonLabel: 'No answer at the door',
        note: 'Tenant away until 5pm',
      }),
    ]);
    expect(liText()).toBe("Couldn't do INS-0045: No answer at the doorTenant away until 5pm");
    expect(screen.getByRole('link', { name: 'INS-0045' })).toHaveAttribute('href', '/appointments/X');
  });

  it('GEOFENCE check-in with and without a radius (L-F03-05)', () => {
    renderList(
      [alert({ type: 'GEOFENCE', appointmentId: 'B', appointmentCode: 'INS-0043', phase: 'START', distanceMeters: 900, radiusMeters: 300 })],
      [stop('B')],
    );
    expect(liText()).toBe('Checked in 900 m from the property (limit 300 m) · INS-0043');

    renderList(
      [alert({ type: 'GEOFENCE', appointmentId: 'B', appointmentCode: 'INS-0043', phase: 'START', distanceMeters: 900, radiusMeters: null })],
      [stop('B')],
    );
    expect(screen.getAllByRole('listitem')[1]!.textContent).toBe('Checked in 900 m from the property · INS-0043');
  });

  it('GEOFENCE check-out uses "Checked out"', () => {
    renderList(
      [alert({ type: 'GEOFENCE', appointmentId: 'B', appointmentCode: 'INS-0043', phase: 'FINISH', distanceMeters: 500, radiusMeters: 300 })],
      [stop('B')],
    );
    expect(liText()).toBe('Checked out 500 m from the property (limit 300 m) · INS-0043');
  });

  it('COMPLETION_REMINDER shows the sent time', () => {
    renderList(
      [alert({ type: 'COMPLETION_REMINDER', appointmentId: 'B', appointmentCode: 'INS-0043', occurredAt: '2026-11-05T11:31:00+11:00' })],
      [stop('B')],
    );
    expect(liText()).toBe('Completion reminder sent for INS-0043 at 11:31 am');
  });

  it('renders nothing when there are no alerts', () => {
    const { container } = renderList([]);
    expect(container.querySelector('ul')).toBeNull();
  });
});
