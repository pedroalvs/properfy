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

  it('calls onConfirm with reason text when no target status', () => {
    const onConfirm = vi.fn();
    render(<StatusTransitionDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText('Enter the reason...'), {
      target: { value: 'Cancellation reason' },
    });
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledWith('Cancellation reason', undefined);
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

  it('shows reason code dropdown for CANCELLED status', () => {
    render(<StatusTransitionDialog {...defaultProps} targetStatus="CANCELLED" />);
    expect(screen.getByLabelText('Reason Code')).toBeInTheDocument();
  });

  it('shows reason code dropdown for REJECTED status', () => {
    render(<StatusTransitionDialog {...defaultProps} targetStatus="REJECTED" />);
    expect(screen.getByLabelText('Reason Code')).toBeInTheDocument();
  });

  it('does not show reason code dropdown for other statuses', () => {
    render(<StatusTransitionDialog {...defaultProps} targetStatus="DRAFT" />);
    expect(screen.queryByLabelText('Reason Code')).not.toBeInTheDocument();
  });

  it('hides free text when reason code dropdown is shown without OTHER selected', () => {
    render(<StatusTransitionDialog {...defaultProps} targetStatus="CANCELLED" />);
    // When a reason code dropdown is shown but no code is selected yet,
    // no free text should be visible (free text only appears for OTHER or non-reason transitions)
    expect(screen.queryByPlaceholderText('Enter the reason...')).not.toBeInTheDocument();
  });
});
