import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ForceConfirmDialog } from './ForceConfirmDialog';

describe('ForceConfirmDialog', () => {
  it('renders dialog when open', () => {
    render(
      <ForceConfirmDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByText('Force Tenant Confirmation')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ForceConfirmDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.queryByText('Force Tenant Confirmation')).not.toBeInTheDocument();
  });

  it('shows warning message', () => {
    render(
      <ForceConfirmDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(
      screen.getByText(/This will override the tenant confirmation status/),
    ).toBeInTheDocument();
  });

  it('has disabled Force Confirm button when reason is empty', () => {
    render(
      <ForceConfirmDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Force Confirm' })).toBeDisabled();
  });

  it('enables Force Confirm button when reason is provided', () => {
    render(
      <ForceConfirmDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Force confirmation reason'), {
      target: { value: 'Verbal confirmation over phone' },
    });
    expect(screen.getByRole('button', { name: 'Force Confirm' })).not.toBeDisabled();
  });

  it('calls onConfirm with reason', () => {
    const onConfirm = vi.fn();
    render(
      <ForceConfirmDialog open={true} onClose={vi.fn()} onConfirm={onConfirm} />,
    );
    fireEvent.change(screen.getByLabelText('Force confirmation reason'), {
      target: { value: 'Verbal confirmation over phone' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Force Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('Verbal confirmation over phone');
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <ForceConfirmDialog open={true} onClose={onClose} onConfirm={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
