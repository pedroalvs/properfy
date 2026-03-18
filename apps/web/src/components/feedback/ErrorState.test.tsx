import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders with alert role', () => {
    render(<ErrorState message="Erro ao carregar" onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders error message', () => {
    render(<ErrorState message="Erro ao carregar dados" onRetry={() => {}} />);
    expect(screen.getByText('Erro ao carregar dados')).toBeInTheDocument();
  });

  it('renders detail when provided', () => {
    render(<ErrorState message="Erro" onRetry={() => {}} detail="Timeout de conexão" />);
    expect(screen.getByText('Timeout de conexão')).toBeInTheDocument();
  });

  it('renders error icon', () => {
    const { container } = render(<ErrorState message="Erro" onRetry={() => {}} />);
    expect(container.querySelector('.mdi-alert-circle')).toBeTruthy();
  });

  it('calls onRetry when retry button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState message="Erro" onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
