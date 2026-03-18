import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ManualAssignModal } from './ManualAssignModal';

describe('ManualAssignModal', () => {
  it('renders dialog when open', () => {
    render(
      <ManualAssignModal
        open={true}
        onClose={vi.fn()}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.getByText('Assign Inspector')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ManualAssignModal
        open={false}
        onClose={vi.fn()}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.queryByText('Assign Inspector')).not.toBeInTheDocument();
  });

  it('has disabled Assign button when input is empty', () => {
    render(
      <ManualAssignModal
        open={true}
        onClose={vi.fn()}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    const button = screen.getByRole('button', { name: 'Assign' });
    expect(button).toBeDisabled();
  });

  it('enables Assign button when inspector is entered', () => {
    render(
      <ManualAssignModal
        open={true}
        onClose={vi.fn()}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.change(screen.getByLabelText('Inspector search'), {
      target: { value: 'inspector-123' },
    });
    expect(screen.getByRole('button', { name: 'Assign' })).not.toBeDisabled();
  });

  it('calls onAssign with inspector value', () => {
    const onAssign = vi.fn();
    render(
      <ManualAssignModal
        open={true}
        onClose={vi.fn()}
        onAssign={onAssign}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.change(screen.getByLabelText('Inspector search'), {
      target: { value: 'inspector-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(onAssign).toHaveBeenCalledWith('inspector-123');
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <ManualAssignModal
        open={true}
        onClose={onClose}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows description text', () => {
    render(
      <ManualAssignModal
        open={true}
        onClose={vi.fn()}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.getByText(/Search for an inspector/)).toBeInTheDocument();
  });
});
