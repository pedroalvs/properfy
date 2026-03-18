import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmStep } from './ConfirmStep';

describe('ConfirmStep', () => {
  const defaultProps = {
    totalRows: 50,
    errorCount: 0,
    onConfirm: vi.fn(),
    onBack: vi.fn(),
    isSubmitting: false,
  };

  it('shows summary counts', () => {
    render(<ConfirmStep {...defaultProps} totalRows={50} errorCount={3} />);

    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Total Rows')).toBeInTheDocument();
    expect(screen.getByText('Valid Rows')).toBeInTheDocument();
    expect(screen.getByText('Error Rows')).toBeInTheDocument();
  });

  it('disables confirm when errors exist', () => {
    render(<ConfirmStep {...defaultProps} errorCount={5} />);

    const confirmBtn = screen.getByText('Start Import');
    expect(confirmBtn.closest('button')).toBeDisabled();
  });

  it('enables confirm when no errors', () => {
    render(<ConfirmStep {...defaultProps} errorCount={0} />);

    const confirmBtn = screen.getByText('Start Import');
    expect(confirmBtn.closest('button')).not.toBeDisabled();
  });

  it('shows loading state when submitting', () => {
    render(<ConfirmStep {...defaultProps} isSubmitting={true} />);

    const confirmBtn = screen.getByText('Start Import').closest('button');
    expect(confirmBtn).toBeDisabled();
  });

  it('calls onConfirm on click', () => {
    const onConfirm = vi.fn();
    render(<ConfirmStep {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Start Import'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<ConfirmStep {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByText('Back'));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
