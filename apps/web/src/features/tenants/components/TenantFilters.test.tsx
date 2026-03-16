import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantFilters } from './TenantFilters';
import { DEFAULT_FILTERS } from '../types';

describe('TenantFilters', () => {
  it('renders both filter controls', () => {
    render(
      <TenantFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status Confirmação')).toBeInTheDocument();
  });

  it('status select shows "Todos" plus 4 status labels', async () => {
    const user = userEvent.setup();
    render(
      <TenantFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status Confirmação'));
    const listbox = screen.getByRole('listbox', { name: 'Status Confirmação' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
    expect(screen.getByText('Sem Resposta')).toBeInTheDocument();
  });

  it('calls onFiltersChange on status selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TenantFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Status Confirmação'));
    await user.click(screen.getByText('Confirmado'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, confirmationStatus: 'CONFIRMED' });
  });

  it('search input accessible via "Buscar"', () => {
    render(
      <TenantFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Buscar');
    expect(input.tagName).toBe('INPUT');
  });
});
