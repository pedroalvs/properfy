import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditGroupModal } from './EditGroupModal';

const mockUpdate = vi.fn();

vi.mock('../hooks/useUpdateServiceGroup', () => ({
  useUpdateServiceGroup: () => ({ update: mockUpdate, isUpdating: false }),
}));

// RegionSelector consumes this hook; mock it so the modal can render regions without a real query.
vi.mock('../hooks/useResolveRegions', () => ({
  useResolveRegions: () => ({
    data: {
      regions: [
        { regionId: 'r1', regionName: 'North', color: '#000', matchedAppointmentCount: 1, inspectorCount: 2 },
        { regionId: 'r2', regionName: 'South', color: '#111', matchedAppointmentCount: 1, inspectorCount: 1 },
      ],
      totalAppointments: 1,
      unmatchedAppointmentIds: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    error: null,
  }),
}));

const mockServiceGroup = {
  id: 'sg-01',
  tenantId: 'ten-1',
  name: 'Test Group',
  serviceRegionId: 'r1',
  regionName: 'North',
  inspectorId: null,
  inspectorName: null,
  status: 'DRAFT' as const,
  priorityMode: 'STANDARD' as const,
  appointmentsCount: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  appointments: [
    {
      id: 'apt-1',
      appointmentNumber: 1,
      status: 'AWAITING_INSPECTOR',
      scheduledDate: null,
      propertyAddress: null,
      propertyCode: null,
    },
  ],
  description: 'A test group',
};

describe('EditGroupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog when open', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText('Edit Service Group')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <EditGroupModal
        open={false}
        onClose={vi.fn()}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByText('Edit Service Group')).not.toBeInTheDocument();
  });

  it('shows name field pre-filled', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    const nameInput = screen.getByLabelText('Service group name');
    expect(nameInput).toHaveValue('Test Group');
  });

  it('shows description field pre-filled', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    const descInput = screen.getByLabelText('Service group description');
    expect(descInput).toHaveValue('A test group');
  });

  it('shows the region selector', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText('Target Region')).toBeInTheDocument();
  });

  it('shows the region selector regardless of status (PUBLISHED)', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={{ ...mockServiceGroup, status: 'PUBLISHED' as const }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText('Target Region')).toBeInTheDocument();
  });

  it('sends serviceRegionId in the update payload when the region changes', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    // Open the region dropdown and pick a different region.
    fireEvent.click(screen.getByRole('button', { name: 'Target Region' }));
    fireEvent.click(screen.getByText('South (1/1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ serviceRegionId: 'r2' });
  });

  it('omits serviceRegionId from the payload when the region is unchanged', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('serviceRegionId');
  });

  it('shows draft-only fields when status is DRAFT', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Scheduled date')).toBeInTheDocument();
    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
    expect(screen.getByLabelText('End time')).toBeInTheDocument();
    expect(screen.getByText('Priority Mode')).toBeInTheDocument();
  });

  it('hides draft-only fields when status is not DRAFT', () => {
    const scheduledGroup = {
      ...mockServiceGroup,
      status: 'PUBLISHED' as const,
    };
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={scheduledGroup}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Scheduled date')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Start time')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('End time')).not.toBeInTheDocument();
    expect(screen.queryByText('Priority Mode')).not.toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <EditGroupModal
        open={true}
        onClose={onClose}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
