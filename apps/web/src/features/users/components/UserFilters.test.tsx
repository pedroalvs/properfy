import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserFilters } from './UserFilters';
import { DEFAULT_FILTERS } from '../types';

describe('UserFilters', () => {
  it('renders all 3 filter controls', () => {
    render(
      <UserFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Perfil')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('role select ("Perfil") shows "Todos" plus 6 role labels', async () => {
    const user = userEvent.setup();
    render(
      <UserFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Perfil'));
    const listbox = screen.getByRole('listbox', { name: 'Perfil' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Admin Master')).toBeInTheDocument();
    expect(screen.getByText('Operador')).toBeInTheDocument();
    expect(screen.getByText('Admin Cliente')).toBeInTheDocument();
    expect(screen.getByText('Usuário Cliente')).toBeInTheDocument();
    expect(screen.getByText('Inspetor')).toBeInTheDocument();
    expect(screen.getByText('Inquilino')).toBeInTheDocument();
  });

  it('status select shows "Todos" plus 3 status labels', async () => {
    const user = userEvent.setup();
    render(
      <UserFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText('Inativo')).toBeInTheDocument();
    expect(screen.getByText('Bloqueado')).toBeInTheDocument();
  });

  it('calls onFiltersChange on role selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <UserFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Perfil'));
    await user.click(screen.getByText('Operador'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, role: 'OP' });
  });

  it('search input accessible via "Buscar"', () => {
    render(
      <UserFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Buscar');
    expect(input.tagName).toBe('INPUT');
  });
});
