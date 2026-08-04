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
    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'Cancellation reason',
      reasonCode: undefined,
      notifyRentalTenant: false,
    });
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

  // EXPIRED is assigned only by the daily auto-cancel sweep. The options list is
  // derived from the enum, so a new code would otherwise appear here automatically.
  it('does not offer EXPIRED as a manual cancellation reason', () => {
    render(<StatusTransitionDialog {...defaultProps} targetStatus="CANCELLED" />);

    // SelectInput renders its options only while open.
    fireEvent.click(screen.getByLabelText('Reason Code'));
    const labels = screen.getAllByRole('option').map((o) => o.textContent);

    expect(labels).not.toContain('Expired');
    expect(labels).toContain('Client Request');
    expect(labels).toContain('Other');
    expect(labels).toHaveLength(6);
  });

  it('hides free text when reason code dropdown is shown without OTHER selected', () => {
    render(<StatusTransitionDialog {...defaultProps} targetStatus="CANCELLED" />);
    // When a reason code dropdown is shown but no code is selected yet,
    // no free text should be visible (free text only appears for OTHER or non-reason transitions)
    expect(screen.queryByPlaceholderText('Enter the reason...')).not.toBeInTheDocument();
  });

  describe('notify-the-tenant checkbox', () => {
    const NOTIFY_LABEL = 'Notify the tenant by email/SMS';

    it('is offered, unchecked, when cancelling an appointment the tenant confirmed', () => {
      render(
        <StatusTransitionDialog
          {...defaultProps}
          targetStatus="CANCELLED"
          rentalTenantNotified
        />,
      );

      expect(screen.getByLabelText(NOTIFY_LABEL)).not.toBeChecked();
    });

    it('is absent when the tenant never confirmed', () => {
      render(
        <StatusTransitionDialog
          {...defaultProps}
          targetStatus="CANCELLED"
          rentalTenantNotified={false}
        />,
      );

      expect(screen.queryByLabelText(NOTIFY_LABEL)).not.toBeInTheDocument();
    });

    it('is absent for a non-cancellation transition even when confirmed', () => {
      render(
        <StatusTransitionDialog
          {...defaultProps}
          targetStatus="REJECTED"
          rentalTenantNotified
        />,
      );

      expect(screen.queryByLabelText(NOTIFY_LABEL)).not.toBeInTheDocument();
    });

    it('reports the opt-in through onConfirm once ticked', () => {
      const onConfirm = vi.fn();
      render(
        <StatusTransitionDialog
          {...defaultProps}
          onConfirm={onConfirm}
          targetStatus="CANCELLED"
          rentalTenantNotified
        />,
      );

      fireEvent.click(screen.getByLabelText('Reason Code'));
      fireEvent.click(screen.getByRole('option', { name: 'Client Request' }));
      // The native input is sr-only, so the label text is the clickable target.
      fireEvent.click(screen.getByText(NOTIFY_LABEL));
      fireEvent.click(screen.getByText('Confirm'));

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          reasonCode: 'CLIENT_REQUEST',
          notifyRentalTenant: true,
        }),
      );
    });

    it('stays off when left untouched', () => {
      const onConfirm = vi.fn();
      render(
        <StatusTransitionDialog
          {...defaultProps}
          onConfirm={onConfirm}
          targetStatus="CANCELLED"
          rentalTenantNotified
        />,
      );

      fireEvent.click(screen.getByLabelText('Reason Code'));
      fireEvent.click(screen.getByRole('option', { name: 'Client Request' }));
      fireEvent.click(screen.getByText('Confirm'));

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ notifyRentalTenant: false }),
      );
    });

    it('resets the opt-in on close/reopen so it never leaks into the next cancellation', () => {
      const props = { ...defaultProps, targetStatus: 'CANCELLED', rentalTenantNotified: true };
      const { rerender } = render(<StatusTransitionDialog {...props} />);

      fireEvent.click(screen.getByText(NOTIFY_LABEL));
      expect(screen.getByLabelText(NOTIFY_LABEL)).toBeChecked();

      rerender(<StatusTransitionDialog {...props} open={false} />);
      rerender(<StatusTransitionDialog {...props} open />);

      expect(screen.getByLabelText(NOTIFY_LABEL)).not.toBeChecked();
    });
  });
});
