import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditGroupModal } from './EditGroupModal';

vi.mock('../hooks/useUpdateServiceGroup', () => ({
  useUpdateServiceGroup: () => ({ update: vi.fn(), isUpdating: false }),
}));

const mockServiceGroup = {
  id: 'sg-01',
  tenantId: 'ten-1',
  name: 'Test Group',
  regionName: 'Region A',
  inspectorId: null,
  inspectorName: null,
  status: 'DRAFT' as const,
  priorityMode: 'STANDARD' as const,
  appointmentsCount: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  appointments: [],
  description: 'A test group',
};

describe('EditGroupModal', () => {
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
