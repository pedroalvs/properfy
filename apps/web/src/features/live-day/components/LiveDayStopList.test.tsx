import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LiveDayStop } from '@properfy/shared';
import { LiveDayStopList } from './LiveDayStopList';

function stop(over: Partial<LiveDayStop>): LiveDayStop {
  return {
    appointmentId: over.appointmentId ?? 'a',
    appointmentCode: over.appointmentCode ?? 'INS-1',
    sequence: over.sequence ?? 1,
    inPlan: over.inPlan ?? true,
    progress: over.progress ?? 'REMAINING',
    agencyName: over.agencyName ?? 'Ray White',
    propertyAddress: over.propertyAddress ?? '14 Crown St',
    suburb: over.suburb ?? 'Surry Hills',
    lat: over.lat ?? null,
    lng: over.lng ?? null,
    missingCoordinates: over.missingCoordinates ?? false,
    windowStart: over.windowStart ?? '08:00',
    windowEnd: over.windowEnd ?? '17:00',
    timezone: over.timezone ?? 'Australia/Sydney',
    startedAt: over.startedAt ?? null,
    finishedAt: over.finishedAt ?? null,
    predictedStartAt: over.predictedStartAt ?? null,
    publishedStartAt: over.publishedStartAt ?? null,
    delayMinutes: over.delayMinutes ?? null,
  } as unknown as LiveDayStop;
}

function renderList(stops: LiveDayStop[], isPastDay = false) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LiveDayStopList stops={stops} color="#156537" isPastDay={isPastDay} />
    </MemoryRouter>,
  );
}

describe('LiveDayStopList', () => {
  it('renders the stops in order', () => {
    renderList([
      stop({ appointmentId: 'a', appointmentCode: 'INS-1', sequence: 1 }),
      stop({ appointmentId: 'b', appointmentCode: 'INS-2', sequence: 2 }),
    ]);
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]!).getByText('INS-1')).toBeInTheDocument();
    expect(within(items[1]!).getByText('INS-2')).toBeInTheDocument();
  });

  it('DONE shows a check and real times', () => {
    const { container } = renderList([
      stop({
        progress: 'DONE',
        startedAt: '2026-11-05T09:02:00+11:00',
        finishedAt: '2026-11-05T09:41:00+11:00',
      }),
    ]);
    expect(container.querySelector('.mdi-check-bold')).toBeInTheDocument();
    expect(screen.getByText('Done 9:02 am – 9:41 am')).toBeInTheDocument();
  });

  it('CURRENT is marked aria-current="step" with its in-progress time', () => {
    renderList([stop({ progress: 'CURRENT', startedAt: '2026-11-05T10:17:00+11:00' })]);
    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute('aria-current', 'step');
    expect(within(item).getByText('In progress since 10:17 am')).toBeInTheDocument();
  });

  it('REMAINING shows the projected ETA', () => {
    renderList([stop({ progress: 'REMAINING', predictedStartAt: '2026-11-05T11:15:00+11:00' })]);
    expect(screen.getByText('ETA 11:15 am')).toBeInTheDocument();
  });

  it('REMAINING on a past day shows "Planned" (L-F05-02)', () => {
    renderList([stop({ progress: 'REMAINING', predictedStartAt: '2026-11-05T11:15:00+11:00' })], true);
    expect(screen.getByText('Planned 11:15 am')).toBeInTheDocument();
  });

  it('an out-of-plan stop shows the "Not in route yet" chip', () => {
    renderList([stop({ inPlan: false, sequence: null })]);
    expect(screen.getByText('Not in route yet')).toBeInTheDocument();
  });

  it('a stop without coordinates shows the location note', () => {
    renderList([stop({ missingCoordinates: true })]);
    expect(screen.getByText('Location not found for this address')).toBeInTheDocument();
  });

  it('the appointment code is a same-tab link', () => {
    renderList([stop({ appointmentId: 'abc', appointmentCode: 'INS-9' })]);
    expect(screen.getByRole('link', { name: 'INS-9' })).toHaveAttribute('href', '/appointments/abc');
  });
});
