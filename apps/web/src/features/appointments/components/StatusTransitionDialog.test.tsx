import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusTransitionDialog } from './StatusTransitionDialog';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  title: 'Cancelar Vistoria',
  message: 'Tem certeza que deseja cancelar?',
  variant: 'danger' as const,
};

describe('StatusTransitionDialog', () => {
  it('renders title and message when open', () => {
    render(<StatusTransitionDialog {...defaultProps} />);
    expect(screen.getByText('Cancelar Vistoria')).toBeInTheDocument();
    expect(screen.getByText('Tem certeza que deseja cancelar?')).toBeInTheDocument();
  });

  it('not rendered when closed', () => {
    render(<StatusTransitionDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Cancelar Vistoria')).not.toBeInTheDocument();
  });

  it('calls onClose when cancel clicked', () => {
    const onClose = vi.fn();
    render(<StatusTransitionDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm with reason text', () => {
    const onConfirm = vi.fn();
    render(<StatusTransitionDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText('Informe o motivo...'), {
      target: { value: 'Motivo do cancelamento' },
    });
    fireEvent.click(screen.getByText('Confirmar'));
    expect(onConfirm).toHaveBeenCalledWith('Motivo do cancelamento');
  });

  it('confirm disabled when reason empty', () => {
    render(<StatusTransitionDialog {...defaultProps} />);
    expect(screen.getByText('Confirmar')).toBeDisabled();
  });

  it('shows loading state', () => {
    render(<StatusTransitionDialog {...defaultProps} loading />);
    expect(screen.getByText('Confirmar')).toBeDisabled();
  });

  it('clears reason on close/reopen', () => {
    const { rerender } = render(<StatusTransitionDialog {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Informe o motivo...'), {
      target: { value: 'Some reason' },
    });
    rerender(<StatusTransitionDialog {...defaultProps} open={false} />);
    rerender(<StatusTransitionDialog {...defaultProps} open={true} />);
    expect(screen.getByPlaceholderText('Informe o motivo...')).toHaveValue('');
  });
});
