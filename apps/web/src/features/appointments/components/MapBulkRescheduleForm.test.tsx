/**
 * MapBulkRescheduleForm — status-preserving reschedule.
 *
 * Posts to `/v1/appointments/bulk-reschedule` (delegates to
 * UpdateAppointmentUseCase, which keeps status and inspector). The destructive
 * SCHEDULED→DRAFT reopen lives in `MapBulkReturnToPoolForm` instead.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MapBulkRescheduleForm, type RescheduleGroupContext } from './MapBulkRescheduleForm';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

// The component resolves "today"/instants in the user's effective timezone;
// pin it to the platform default so these tests stay deterministic.
vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));


const mutateAsync = vi.fn();
vi.mock('../hooks/useBulkRescheduleAppointments', () => ({
  useBulkRescheduleAppointments: () => ({ mutateAsync, isPending: false }),
}));

function makeAppointment(overrides: Partial<AppointmentMapItem> = {}): AppointmentMapItem {
  return {
    id: 'appt-1', code: 'INS-0001', status: 'AWAITING_INSPECTOR', propertyAddress: '1 Test St',
    latitude: 0, longitude: 0, scheduledDate: '2027-06-15', timeSlotStart: '09:00', timeSlotEnd: '10:00',
    inspectorName: null, branchName: 'Branch A', serviceGroupId: 'sg-1',
    ...overrides,
  };
}

const GROUP: RescheduleGroupContext = { id: 'sg-1', timeWindow: '08:00-12:00', status: 'PUBLISHED', code: '42' };

function renderForm(
  appointments: AppointmentMapItem[],
  group: RescheduleGroupContext | null = GROUP,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MapBulkRescheduleForm
          checkedAppointments={appointments}
          serviceGroups={group ? [group] : []}
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

describe('MapBulkRescheduleForm', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ data: { results: [] } });
  });

  it('renders a free start/end time range and no date input', () => {
    renderForm([makeAppointment()]);
    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
    expect(screen.getByLabelText('End time')).toBeInTheDocument();
    expect(screen.queryByTestId('map-bulk-reschedule-date')).toBeNull();
  });

  it('posts the status-preserving payload with expandGroupTimeWindow', async () => {
    renderForm([makeAppointment()]);
    setTime('13:00', '16:00');
    fireEvent.click(screen.getByTestId('map-bulk-reschedule-apply'));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        appointmentIds: ['appt-1'],
        newDate: '2027-06-15',
        newTimeSlotStart: '13:00',
        newTimeSlotEnd: '16:00',
        expandGroupTimeWindow: true,
      });
    });
  });

  it('normalizes an ISO datetime scheduledDate to date-only before submitting', async () => {
    renderForm([makeAppointment({ scheduledDate: '2027-06-15T00:00:00.000Z' })]);
    setTime('13:00', '16:00');
    fireEvent.click(screen.getByTestId('map-bulk-reschedule-apply'));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ newDate: '2027-06-15' }));
    });
  });

  it('blocks submission when same-group appointments have different scheduled dates', () => {
    renderForm([
      makeAppointment(),
      makeAppointment({ id: 'appt-2', code: 'INS-0002', scheduledDate: '2027-06-16' }),
    ]);
    expect(screen.getByTestId('map-bulk-reschedule-scope-banner')).toHaveTextContent(
      'Selected appointments have different dates',
    );
    expect(screen.getByTestId('map-bulk-reschedule-apply')).toBeDisabled();
  });

  describe('pre-apply warnings', () => {
    it('previews the widened group window when the new slot escapes it', () => {
      renderForm([makeAppointment()]);
      setTime('13:00', '16:00');
      expect(screen.getByTestId('map-bulk-reschedule-window-warning')).toHaveTextContent(
        '08:00-12:00 will widen to 08:00-16:00',
      );
    });

    it('previews a widened start when the new slot begins earlier', () => {
      renderForm([makeAppointment()]);
      setTime('07:00', '09:30');
      expect(screen.getByTestId('map-bulk-reschedule-window-warning')).toHaveTextContent(
        '08:00-12:00 will widen to 07:00-12:00',
      );
    });

    it('shows no window warning when the new slot already fits', () => {
      renderForm([makeAppointment()]);
      setTime('09:30', '11:00');
      expect(screen.queryByTestId('map-bulk-reschedule-window-warning')).toBeNull();
    });

    it('warns that an inspector already accepted the group', () => {
      renderForm([makeAppointment()], { ...GROUP, status: 'ACCEPTED' });
      setTime('13:00', '16:00');
      expect(screen.getByTestId('map-bulk-reschedule-accepted-warning')).toHaveTextContent(
        /inspector has already accepted/i,
      );
    });

    it('does not warn about acceptance for a group nobody accepted yet', () => {
      renderForm([makeAppointment()]);
      setTime('13:00', '16:00');
      expect(screen.queryByTestId('map-bulk-reschedule-accepted-warning')).toBeNull();
    });

    it('names the appointments whose tenant already confirmed and promises a new notification', () => {
      renderForm([
        makeAppointment({ rentalTenantConfirmationStatus: 'CONFIRMED' }),
        makeAppointment({ id: 'appt-2', code: 'INS-0002', rentalTenantConfirmationStatus: 'PENDING' }),
      ]);
      const warning = screen.getByTestId('map-bulk-reschedule-confirmed-warning');
      expect(warning).toHaveTextContent('INS-0001');
      expect(warning).not.toHaveTextContent('INS-0002');
      expect(warning).toHaveTextContent(/new notification/i);
    });

    it('shows no tenant warning when nobody had confirmed', () => {
      renderForm([makeAppointment({ rentalTenantConfirmationStatus: 'PENDING' })]);
      expect(screen.queryByTestId('map-bulk-reschedule-confirmed-warning')).toBeNull();
    });

    // CL_ADMIN never loads the AM/OP-only groups query — the form must still
    // submit, just without the window preview.
    it('still submits when the group is not loaded', async () => {
      renderForm([makeAppointment()], null);
      setTime('13:00', '16:00');
      expect(screen.queryByTestId('map-bulk-reschedule-window-warning')).toBeNull();
      fireEvent.click(screen.getByTestId('map-bulk-reschedule-apply'));

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ expandGroupTimeWindow: true }),
        );
      });
    });
  });
});
