import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapSelectionPanel } from './MapSelectionPanel';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

function makeAppointment(overrides: Partial<AppointmentMapItem> = {}): AppointmentMapItem {
  return {
    id: 'apt-1',
    code: 'INS-0001',
    latitude: -33.8,
    longitude: 151.2,
    status: 'SCHEDULED',
    serviceTypeName: 'Routine Inspection',
    scheduledDate: '2026-05-06',
    timeSlot: '08:00-12:00',
    propertyAddress: '123 Test St',
    tenantConfirmation: 'CONFIRMED',
    serviceGroupId: null,
    flowType: 'ROUTINE',
    ...overrides,
  } as AppointmentMapItem;
}

describe('MapSelectionPanel', () => {
  const onClearSelection = vi.fn();
  const onCreateGroup = vi.fn();

  it('renders nothing when no appointments selected', () => {
    const { container } = render(
      <MapSelectionPanel
        selectedAppointments={[]}
        onClearSelection={onClearSelection}
        onCreateGroup={onCreateGroup}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders count and create button when appointments selected', () => {
    const appointments = [makeAppointment()];
    render(
      <MapSelectionPanel
        selectedAppointments={appointments}
        onClearSelection={onClearSelection}
        onCreateGroup={onCreateGroup}
      />,
    );
    expect(screen.getByText('1 appointment selected')).toBeInTheDocument();
    expect(screen.getByText(/Create Group/)).toBeInTheDocument();
  });

  it('shows plural text for multiple appointments', () => {
    const appointments = [
      makeAppointment({ id: 'apt-1', code: 'INS-0001' }),
      makeAppointment({ id: 'apt-2', code: 'INS-0002' }),
    ];
    render(
      <MapSelectionPanel
        selectedAppointments={appointments}
        onClearSelection={onClearSelection}
        onCreateGroup={onCreateGroup}
      />,
    );
    expect(screen.getByText('2 appointments selected')).toBeInTheDocument();
  });

  it('shows appointment codes when 10 or fewer selected', () => {
    const appointments = [
      makeAppointment({ id: 'apt-1', code: 'INS-0001' }),
      makeAppointment({ id: 'apt-2', code: 'INS-0002' }),
    ];
    render(
      <MapSelectionPanel
        selectedAppointments={appointments}
        onClearSelection={onClearSelection}
        onCreateGroup={onCreateGroup}
      />,
    );
    expect(screen.getByText('INS-0001')).toBeInTheDocument();
    expect(screen.getByText('INS-0002')).toBeInTheDocument();
  });

  it('shows error message when exceeding 30 appointments', () => {
    const appointments = Array.from({ length: 31 }, (_, i) =>
      makeAppointment({ id: `apt-${i}`, code: `INS-${String(i).padStart(4, '0')}` }),
    );
    render(
      <MapSelectionPanel
        selectedAppointments={appointments}
        onClearSelection={onClearSelection}
        onCreateGroup={onCreateGroup}
      />,
    );
    expect(screen.getByText(/Maximum 30 appointments per group/)).toBeInTheDocument();
  });

  it('disables create button when exceeding max', () => {
    const appointments = Array.from({ length: 31 }, (_, i) =>
      makeAppointment({ id: `apt-${i}`, code: `INS-${String(i).padStart(4, '0')}` }),
    );
    render(
      <MapSelectionPanel
        selectedAppointments={appointments}
        onClearSelection={onClearSelection}
        onCreateGroup={onCreateGroup}
      />,
    );
    const createBtn = screen.getByText(/Create Group/).closest('button');
    expect(createBtn).toBeDisabled();
  });

  it('calls onClearSelection when clear button clicked', () => {
    const appointments = [makeAppointment()];
    render(
      <MapSelectionPanel
        selectedAppointments={appointments}
        onClearSelection={onClearSelection}
        onCreateGroup={onCreateGroup}
      />,
    );
    fireEvent.click(screen.getByText('Clear selection'));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('calls onCreateGroup when create button clicked', () => {
    const appointments = [makeAppointment()];
    render(
      <MapSelectionPanel
        selectedAppointments={appointments}
        onClearSelection={onClearSelection}
        onCreateGroup={onCreateGroup}
      />,
    );
    fireEvent.click(screen.getByText(/Create Group/));
    expect(onCreateGroup).toHaveBeenCalledTimes(1);
  });
});
