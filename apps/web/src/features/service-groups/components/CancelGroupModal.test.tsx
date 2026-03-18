import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CancelGroupModal } from './CancelGroupModal';

describe('CancelGroupModal', () => {
  it('renders dialog when open', () => {
    render(
      <CancelGroupModal
        open={true}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.getByText('Cancel Service Group')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <CancelGroupModal
        open={false}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.queryByText('Cancel Service Group')).not.toBeInTheDocument();
  });

  it('shows warning message', () => {
    render(
      <CancelGroupModal
        open={true}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.getByText(/This action will cancel the service group/)).toBeInTheDocument();
  });

  it('has disabled Cancel Group button when reason is empty', () => {
    render(
      <CancelGroupModal
        open={true}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel Group' })).toBeDisabled();
  });

  it('enables Cancel Group button when reason is provided', () => {
    render(
      <CancelGroupModal
        open={true}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.change(screen.getByLabelText('Cancellation reason'), {
      target: { value: 'Weather issues' },
    });
    expect(screen.getByRole('button', { name: 'Cancel Group' })).not.toBeDisabled();
  });

  it('calls onCancel with reason', () => {
    const onCancel = vi.fn();
    render(
      <CancelGroupModal
        open={true}
        onClose={vi.fn()}
        onCancel={onCancel}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.change(screen.getByLabelText('Cancellation reason'), {
      target: { value: 'Weather issues' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Group' }));
    expect(onCancel).toHaveBeenCalledWith('Weather issues');
  });

  it('calls onClose when Keep Group is clicked', () => {
    const onClose = vi.fn();
    render(
      <CancelGroupModal
        open={true}
        onClose={onClose}
        onCancel={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep Group' }));
    expect(onClose).toHaveBeenCalled();
  });
});
