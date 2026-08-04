/**
 * MapBulkReturnToPoolForm — the destructive reopen (SCHEDULED → DRAFT, inspector
 * cleared) that used to be mislabelled "Reschedule".
 *
 * The backend rejects any row that is not SCHEDULED, so the form says which rows
 * will fail BEFORE submit rather than surfacing a raw error afterwards.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MapBulkReturnToPoolForm } from './MapBulkReturnToPoolForm';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

// The component resolves "today"/instants in the user's effective timezone;
// pin it to the platform default so these tests stay deterministic.
vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));


const mutateAsync = vi.fn();
vi.mock('../hooks/useBulkReopenForReschedule', () => ({
  useBulkReopenForReschedule: () => ({ mutateAsync, isPending: false }),
}));

function makeAppointment(overrides: Partial<AppointmentMapItem> = {}): AppointmentMapItem {
  return {
    id: 'appt-1', code: 'INS-0001', status: 'SCHEDULED', propertyAddress: '1 Test St',
    latitude: 0, longitude: 0, scheduledDate: '2027-06-15', timeSlotStart: '09:00', timeSlotEnd: '10:00',
    inspectorName: 'Jane Doe', branchName: 'Branch A', serviceGroupId: 'sg-1',
    ...overrides,
  };
}

function renderForm(appointments: AppointmentMapItem[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MapBulkReturnToPoolForm
          checkedAppointments={appointments}
          onCancel={vi.fn()}
          onComplete={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setTime(start: string, end: string) {
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: start } });
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: end } });
}

function setReason(text: string) {
  fireEvent.change(screen.getByTestId('map-bulk-return-to-pool-reason'), { target: { value: text } });
}

describe('MapBulkReturnToPoolForm', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ data: { results: [] } });
  });

  it('submits the reopen payload for SCHEDULED rows', async () => {
    renderForm([makeAppointment()]);
    setTime('13:00', '16:00');
    setReason('Inspector unavailable');
    fireEvent.click(screen.getByTestId('map-bulk-return-to-pool-apply'));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentIds: ['appt-1'],
          newDate: '2027-06-15',
          newTimeSlotStart: '13:00',
          newTimeSlotEnd: '16:00',
          reason: 'Inspector unavailable',
        }),
      );
    });
  });

  it('states that the inspector will be unassigned', () => {
    renderForm([makeAppointment()]);
    expect(screen.getByTestId('map-bulk-return-to-pool-effect')).toHaveTextContent(
      /unassigns? the inspector|inspector will be unassigned/i,
    );
  });

  // The original defect: a batch of AWAITING_INSPECTOR rows failed with
  // "must be in SCHEDULED status to reopen for reschedule" only AFTER submit.
  it('names non-SCHEDULED rows before submit and blocks the action', () => {
    renderForm([
      makeAppointment({ id: 'appt-2', code: 'INS-0268', status: 'AWAITING_INSPECTOR' }),
    ]);

    const warning = screen.getByTestId('map-bulk-return-to-pool-status-warning');
    expect(warning).toHaveTextContent('INS-0268');
    expect(screen.getByTestId('map-bulk-return-to-pool-apply')).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('blocks a mixed selection rather than silently dropping the bad rows', () => {
    renderForm([
      makeAppointment(),
      makeAppointment({ id: 'appt-2', code: 'INS-0268', status: 'AWAITING_INSPECTOR' }),
    ]);

    expect(screen.getByTestId('map-bulk-return-to-pool-status-warning')).toHaveTextContent('INS-0268');
    expect(screen.getByTestId('map-bulk-return-to-pool-apply')).toBeDisabled();
  });

  it('shows no status warning when every row is SCHEDULED', () => {
    renderForm([makeAppointment()]);
    expect(screen.queryByTestId('map-bulk-return-to-pool-status-warning')).toBeNull();
  });

  it('blocks submission when the selection spans different dates', () => {
    renderForm([
      makeAppointment(),
      makeAppointment({ id: 'appt-2', code: 'INS-0002', scheduledDate: '2027-06-16' }),
    ]);
    expect(screen.getByTestId('map-bulk-return-to-pool-scope-banner')).toHaveTextContent(
      'Selected appointments have different dates',
    );
    expect(screen.getByTestId('map-bulk-return-to-pool-apply')).toBeDisabled();
  });

  // Root CLAUDE.md §5 — sensitive transitions require a reason, and this one
  // reverts to DRAFT and drops the inspector.
  it('blocks submission until a reason is given', () => {
    renderForm([makeAppointment()]);
    setTime('13:00', '16:00');
    expect(screen.getByTestId('map-bulk-return-to-pool-apply')).toBeDisabled();

    setReason('ab'); // below the 3-character minimum
    expect(screen.getByTestId('map-bulk-return-to-pool-apply')).toBeDisabled();

    setReason('Inspector unavailable');
    expect(screen.getByTestId('map-bulk-return-to-pool-apply')).toBeEnabled();
  });

  it('trims the reason before sending it', async () => {
    renderForm([makeAppointment()]);
    setTime('13:00', '16:00');
    setReason('   Client requested a different inspector   ');
    fireEvent.click(screen.getByTestId('map-bulk-return-to-pool-apply'));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Client requested a different inspector' }),
      );
    });
  });
});
