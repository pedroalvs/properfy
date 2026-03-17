import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Excluir item',
    message: 'Tem certeza que deseja excluir?',
  };

  it('renders title and message', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Excluir item')).toBeInTheDocument();
    expect(screen.getByText('Tem certeza que deseja excluir?')).toBeInTheDocument();
  });

  it('renders default button labels', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders custom button labels', () => {
    render(
      <ConfirmDialog {...defaultProps} confirmLabel="Sim, excluir" cancelLabel="Não" />,
    );
    expect(screen.getByRole('button', { name: 'Sim, excluir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Não' })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onClose when cancel clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConfirmDialog {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows loading state on confirm button', () => {
    render(<ConfirmDialog {...defaultProps} loading />);
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled();
  });

  it('danger variant uses error color on confirm', () => {
    render(<ConfirmDialog {...defaultProps} variant="danger" />);
    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmBtn.className).toContain('bg-error');
  });

  it('is not rendered when open is false', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Excluir item')).not.toBeInTheDocument();
  });
});
