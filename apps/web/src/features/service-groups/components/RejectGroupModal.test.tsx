import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RejectGroupModal } from './RejectGroupModal';

describe('RejectGroupModal', () => {
  it('renders dialog when open', () => {
    render(
      <RejectGroupModal
        open={true}
        onClose={vi.fn()}
        onReject={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.getByText('Reject Service Group')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <RejectGroupModal
        open={false}
        onClose={vi.fn()}
        onReject={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.queryByText('Reject Service Group')).not.toBeInTheDocument();
  });

  it('shows warning message', () => {
    render(
      <RejectGroupModal
        open={true}
        onClose={vi.fn()}
        onReject={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(
      screen.getByText(/This action will reject the service group/),
    ).toBeInTheDocument();
  });

  it('has disabled Reject Group button when reason is empty', () => {
    render(
      <RejectGroupModal
        open={true}
        onClose={vi.fn()}
        onReject={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.getByRole('button', { name: 'Reject Group' })).toBeDisabled();
  });

  it('enables Reject Group button when reason is provided', () => {
    render(
      <RejectGroupModal
        open={true}
        onClose={vi.fn()}
        onReject={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.change(screen.getByLabelText('Rejection reason'), {
      target: { value: 'Invalid address' },
    });
    expect(screen.getByRole('button', { name: 'Reject Group' })).not.toBeDisabled();
  });

  it('calls onReject with reason', () => {
    const onReject = vi.fn();
    render(
      <RejectGroupModal
        open={true}
        onClose={vi.fn()}
        onReject={onReject}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.change(screen.getByLabelText('Rejection reason'), {
      target: { value: 'Invalid address' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject Group' }));
    expect(onReject).toHaveBeenCalledWith('Invalid address');
  });

  it('calls onClose when Keep Group is clicked', () => {
    const onClose = vi.fn();
    render(
      <RejectGroupModal
        open={true}
        onClose={onClose}
        onReject={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep Group' }));
    expect(onClose).toHaveBeenCalled();
  });
});
