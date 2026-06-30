import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditGroupModal } from './EditGroupModal';

const mockUpdate = vi.fn();

vi.mock('../hooks/useUpdateServiceGroup', () => ({
  useUpdateServiceGroup: () => ({ update: mockUpdate, isUpdating: false }),
}));

// Stub RegionSelector so the modal test drives handleSave's region branches deterministically
// (the real SelectInput has no "empty" option, so clearing can only be exercised via this stub).
// RegionSelector's own rendering/banners are covered in RegionSelector.test.tsx.
vi.mock('./RegionSelector', () => ({
  RegionSelector: ({ selectedRegionId, onRegionChange }: { selectedRegionId: string; onRegionChange: (id: string) => void }) => (
    <div>
      <span>region-value:{selectedRegionId}</span>
      <button type="button" onClick={() => onRegionChange('r2')}>set-region-r2</button>
      <button type="button" onClick={() => onRegionChange('')}>clear-region</button>
    </div>
  ),
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

  it('renders the region selector pre-filled with the current region', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText('region-value:r1')).toBeInTheDocument();
  });

  it('renders the region selector regardless of status (PUBLISHED)', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={{ ...mockServiceGroup, status: 'PUBLISHED' as const }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'set-region-r2' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'set-region-r2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ serviceRegionId: 'r2' });
  });

  it('sends serviceRegionId: null when the region is cleared', () => {
    render(
      <EditGroupModal
        open={true}
        onClose={vi.fn()}
        serviceGroup={mockServiceGroup}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'clear-region' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toHaveProperty('serviceRegionId', null);
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
