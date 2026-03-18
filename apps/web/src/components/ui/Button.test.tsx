import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('applies primary variant by default', () => {
    render(<Button>Salvar</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-real-estate');
  });

  it('applies secondary variant', () => {
    render(<Button variant="secondary">Cancelar</Button>);
    expect(screen.getByRole('button').className).toContain('bg-btn-secondary-bg');
  });

  it('applies outlined variant', () => {
    render(<Button variant="outlined">Editar</Button>);
    expect(screen.getByRole('button').className).toContain('border-primary');
  });

  it('shows loading spinner and disables button', () => {
    render(<Button loading>Salvando</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.querySelector('.mdi-loading')).toBeTruthy();
  });

  it('disables button when disabled prop is true', () => {
    render(<Button disabled>Salvar</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Clique</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Clique</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
