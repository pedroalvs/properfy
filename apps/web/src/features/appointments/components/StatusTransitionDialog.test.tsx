import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusTransitionDialog } from './StatusTransitionDialog';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  title: 'Cancel Appointment',
  message: 'Are you sure you want to cancel?',
  variant: 'danger' as const,
};

describe('StatusTransitionDialog', () => {
  it('renders title and message when open', () => {
    render(<StatusTransitionDialog {...defaultProps} />);
    expect(screen.getByText('Cancel Appointment')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to cancel?')).toBeInTheDocument();
  });

  it('not rendered when closed', () => {
    render(<StatusTransitionDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Cancel Appointment')).not.toBeInTheDocument();
  });

  it('calls onClose when cancel clicked', () => {
    const onClose = vi.fn();
    render(<StatusTransitionDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm with reason text', () => {
    const onConfirm = vi.fn();
    render(<StatusTransitionDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText('Enter the reason...'), {
      target: { value: 'Cancellation reason' },
    });
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledWith('Cancellation reason');
  });

  it('confirm disabled when reason empty', () => {
    render(<StatusTransitionDialog {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeDisabled();
  });

  it('shows loading state', () => {
    render(<StatusTransitionDialog {...defaultProps} loading />);
    expect(screen.getByText('Confirm')).toBeDisabled();
  });

  it('clears reason on close/reopen', () => {
    const { rerender } = render(<StatusTransitionDialog {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Enter the reason...'), {
      target: { value: 'Some reason' },
    });
    rerender(<StatusTransitionDialog {...defaultProps} open={false} />);
    rerender(<StatusTransitionDialog {...defaultProps} open={true} />);
    expect(screen.getByPlaceholderText('Enter the reason...')).toHaveValue('');
  });
});
