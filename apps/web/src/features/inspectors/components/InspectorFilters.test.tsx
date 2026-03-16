import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InspectorFilters } from './InspectorFilters';
import { DEFAULT_FILTERS } from '../types';

describe('InspectorFilters', () => {
  it('renders both filter controls', () => {
    render(
      <InspectorFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('status select shows "Todos" plus 2 status labels', async () => {
    const user = userEvent.setup();
    render(
      <InspectorFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });

  it('calls onFiltersChange on status selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InspectorFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    await user.click(screen.getByText('Ativo'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'ACTIVE' });
  });

  it('search input accessible via "Buscar"', () => {
    render(
      <InspectorFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Buscar');
    expect(input.tagName).toBe('INPUT');
  });
});
