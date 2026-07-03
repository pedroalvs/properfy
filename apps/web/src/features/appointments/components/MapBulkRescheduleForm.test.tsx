/**
 * MapBulkRescheduleForm — free start/end time range.
 * The catalog-fed dropdown was removed; the form now uses the shared
 * TimeRangeInput and posts newTimeSlotStart / newTimeSlotEnd.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MapBulkRescheduleForm } from './MapBulkRescheduleForm';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

const mutateAsync = vi.fn();
vi.mock('../hooks/useBulkReopenForReschedule', () => ({
  useBulkReopenForReschedule: () => ({ mutateAsync, isPending: false }),
}));

function makeAppointment(overrides: Partial<AppointmentMapItem> = {}): AppointmentMapItem {
  return {
    id: 'appt-1', code: 'INS-0001', status: 'SCHEDULED', propertyAddress: '1 Test St',
    latitude: 0, longitude: 0, scheduledDate: '2027-06-15', timeSlotStart: '09:00', timeSlotEnd: '10:00',
    inspectorName: null, branchName: 'Branch A', serviceGroupId: 'sg-1',
    ...overrides,
  };
}

function renderForm(appointments: AppointmentMapItem[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MapBulkRescheduleForm
          checkedAppointments={appointments}
          onCancel={vi.fn()}
          onComplete={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MapBulkRescheduleForm — free start/end time range', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ data: { results: [] } });
  });

  it('renders a free start/end time range (no catalog dropdown)', () => {
    renderForm([makeAppointment()]);
    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
    expect(screen.getByLabelText('End time')).toBeInTheDocument();
  });

  it('submits newTimeSlotStart/newTimeSlotEnd to the reopen-for-reschedule mutation', async () => {
    renderForm([makeAppointment()]);
    fireEvent.change(screen.getByTestId('map-bulk-reschedule-date'), { target: { value: '2027-06-20' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '13:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '16:00' } });
    fireEvent.click(screen.getByTestId('map-bulk-reschedule-apply'));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentIds: ['appt-1'],
          newDate: '2027-06-20',
          newTimeSlotStart: '13:00',
          newTimeSlotEnd: '16:00',
        }),
      );
    });
  });

  it('opens the native picker when the date input is clicked', () => {
    renderForm([makeAppointment()]);
    const input = screen.getByTestId('map-bulk-reschedule-date') as HTMLInputElement;
    const showPickerSpy = vi.fn();
    (input as any).showPicker = showPickerSpy;
    fireEvent.click(input);
    expect(showPickerSpy).toHaveBeenCalledTimes(1);
  });
});
