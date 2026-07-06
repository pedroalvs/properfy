import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MapAddToGroupSubModal } from './MapAddToGroupSubModal';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

const mockFindGroups = vi.fn();
const mockEligibility = vi.fn();
const mockAdd = vi.fn();

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
  { id: 'appt-1', code: 'A-1' },
  { id: 'appt-2', code: 'A-2' },
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
});

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

  it('shows the mixed banner mentioning service type only', async () => {
    mockFindGroups.mockResolvedValue({ data: { groups: [], reason: 'MIXED_APPOINTMENT_PROPERTIES' } });
    render(<MapAddToGroupSubModal open onClose={() => {}} appointments={appointments} />);

    const banner = await screen.findByTestId('map-add-to-group-mixed-banner');
    expect(banner.textContent).toContain('same service type');
    expect(banner.textContent).not.toContain('date');
  });
});
