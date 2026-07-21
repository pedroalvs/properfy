import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MapAddToGroupSubModal } from './MapAddToGroupSubModal';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

const mockFindGroups = vi.fn();
const mockEligibility = vi.fn();
const mockAdd = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}));

vi.mock('../hooks/useFindAddableGroupsForAppointments', () => ({
  useFindAddableGroupsForAppointments: () => ({ mutateAsync: mockFindGroups }),
}));
vi.mock('../hooks/useAppointmentsEligibilityCheck', () => ({
  useAppointmentsEligibilityCheck: () => ({ mutateAsync: mockEligibility }),
}));
vi.mock('../hooks/useAddAppointmentsToGroup', () => ({
  useAddAppointmentsToGroup: () => ({ mutateAsync: mockAdd, isPending: false }),
}));

const appointments = [
  { id: 'appt-1', code: 'A-1', scheduledDate: '2026-08-05' },
  { id: 'appt-2', code: 'A-2', scheduledDate: '2026-08-01' },
] as unknown as AppointmentMapItem[];

const sameDayAppointments = [
  { id: 'appt-1', code: 'A-1', scheduledDate: '2026-08-01' },
] as unknown as AppointmentMapItem[];

const group = {
  id: 'group-1',
  groupNumber: 7,
  code: '7',
  status: 'DRAFT',
  scheduledDate: '2026-08-01',
  timeWindow: '09:00-12:00',
  currentSize: 3,
  serviceTypeName: 'Routine',
};

beforeEach(() => {
  mockFindGroups.mockReset().mockResolvedValue({ data: { groups: [group] } });
  mockEligibility.mockReset().mockResolvedValue({
    data: { eligibleAppointmentIds: ['appt-1', 'appt-2'], ineligibleAppointmentIds: [], groupAccepts: true, groupReasons: [] },
  });
  mockAdd.mockReset().mockResolvedValue({ data: { results: [] } });
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
});

async function selectGroupAndAdd(appts: AppointmentMapItem[]) {
  render(<MapAddToGroupSubModal open onClose={() => {}} appointments={appts} />);
  await waitFor(() => expect(screen.getByLabelText('Service group')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('Service group'));
  fireEvent.click(screen.getByText('Group 7 · 01/08/2026 · 09:00-12:00 (3 appts)'));
  const confirm = await screen.findByTestId('map-add-to-group-confirm');
  await waitFor(() => expect(confirm).not.toBeDisabled());
  fireEvent.click(confirm);
  await waitFor(() => expect(mockAdd).toHaveBeenCalled());
}

describe('MapAddToGroupSubModal', () => {
  it('shows the group date in the option label', async () => {
    render(<MapAddToGroupSubModal open onClose={() => {}} appointments={appointments} />);
    await waitFor(() => expect(screen.getByLabelText('Service group')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Service group'));
    expect(screen.getByText('Group 7 · 01/08/2026 · 09:00-12:00 (3 appts)')).toBeInTheDocument();
  });

  it('shows a date-sync banner when a group is selected', async () => {
    render(<MapAddToGroupSubModal open onClose={() => {}} appointments={appointments} />);
    await waitFor(() => expect(screen.getByLabelText('Service group')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Service group'));
    fireEvent.click(screen.getByText('Group 7 · 01/08/2026 · 09:00-12:00 (3 appts)'));

    const banner = await screen.findByTestId('map-add-to-group-date-sync-banner');
    expect(banner.textContent).toContain("moved to the group's date (01/08/2026)");
  });

  it('hides the date-sync banner when all appointments already share the group date', async () => {
    render(<MapAddToGroupSubModal open onClose={() => {}} appointments={sameDayAppointments} />);
    await waitFor(() => expect(screen.getByLabelText('Service group')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Service group'));
    fireEvent.click(screen.getByText('Group 7 · 01/08/2026 · 09:00-12:00 (3 appts)'));

    await waitFor(() => expect(mockEligibility).toHaveBeenCalled());
    expect(screen.queryByTestId('map-add-to-group-date-sync-banner')).not.toBeInTheDocument();
  });

  it('shows a success toast with the target group code after adding appointments', async () => {
    mockAdd.mockResolvedValue({
      data: {
        results: [
          { appointmentId: 'appt-1', status: 'OK' },
          { appointmentId: 'appt-2', status: 'OK' },
        ],
      },
    });

    await selectGroupAndAdd(appointments);

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('2 appointments added to group 7');
    });
  });

  it('uses the singular form in the toast when a single appointment is added', async () => {
    mockEligibility.mockResolvedValue({
      data: { eligibleAppointmentIds: ['appt-1'], ineligibleAppointmentIds: [], groupAccepts: true, groupReasons: [] },
    });
    mockAdd.mockResolvedValue({
      data: { results: [{ appointmentId: 'appt-1', status: 'OK' }] },
    });

    await selectGroupAndAdd(sameDayAppointments);

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('1 appointment added to group 7');
    });
  });

  it('does not show a success toast when no appointment was added', async () => {
    mockAdd.mockResolvedValue({
      data: {
        results: [
          { appointmentId: 'appt-1', status: 'FAILED', error: { code: 'X', message: 'boom' } },
          { appointmentId: 'appt-2', status: 'FAILED', error: { code: 'X', message: 'boom' } },
        ],
      },
    });

    await selectGroupAndAdd(appointments);

    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('shows the mixed banner mentioning service type only', async () => {
    mockFindGroups.mockResolvedValue({ data: { groups: [], reason: 'MIXED_APPOINTMENT_PROPERTIES' } });
    render(<MapAddToGroupSubModal open onClose={() => {}} appointments={appointments} />);

    const banner = await screen.findByTestId('map-add-to-group-mixed-banner');
    expect(banner.textContent).toContain('same service type');
    expect(banner.textContent).not.toContain('date');
  });
});
