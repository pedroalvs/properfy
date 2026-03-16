import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceGroupFilters } from './ServiceGroupFilters';
import { DEFAULT_FILTERS } from '../types';

describe('ServiceGroupFilters', () => {
  it('renders both filter controls', () => {
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('status select shows "Todos" plus 4 status labels', async () => {
    const user = userEvent.setup();
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getByText('Aceito')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });

  it('calls onFiltersChange on status selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    await user.click(screen.getByText('Publicado'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'PUBLISHED' });
  });

  it('search input accessible via "Buscar"', () => {
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Buscar');
    expect(input.tagName).toBe('INPUT');
  });
});
