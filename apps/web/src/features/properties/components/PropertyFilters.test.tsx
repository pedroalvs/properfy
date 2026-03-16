import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyFilters } from './PropertyFilters';
import { DEFAULT_FILTERS } from '../types';
import type { FilterSelectOption } from '@/components/filters/FilterSelect';

const branchOptions: FilterSelectOption[] = [
  { label: 'Todas', value: '' },
  { label: 'Filial Centro', value: 'branch-1' },
];

describe('PropertyFilters', () => {
  it('renders all 3 filter controls', () => {
    render(
      <PropertyFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
      />,
    );
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Filial')).toBeInTheDocument();
  });

  it('type select shows "Todos" plus 4 type labels', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
      />,
    );
    await user.click(screen.getByLabelText('Tipo'));
    const listbox = screen.getByRole('listbox', { name: 'Tipo' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Residencial')).toBeInTheDocument();
    expect(screen.getByText('Comercial')).toBeInTheDocument();
    expect(screen.getByText('Industrial')).toBeInTheDocument();
    expect(screen.getByText('Rural')).toBeInTheDocument();
  });

  it('calls onFiltersChange on type selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PropertyFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
        branchOptions={branchOptions}
      />,
    );
    await user.click(screen.getByLabelText('Tipo'));
    await user.click(screen.getByText('Comercial'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, type: 'COMMERCIAL' });
  });

  it('calls onFiltersChange on branch selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PropertyFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
        branchOptions={branchOptions}
      />,
    );
    await user.click(screen.getByLabelText('Filial'));
    await user.click(screen.getByText('Filial Centro'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, branchId: 'branch-1' });
  });

  it('search input accessible via "Buscar"', () => {
    render(
      <PropertyFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
      />,
    );
    const input = screen.getByLabelText('Buscar');
    expect(input.tagName).toBe('INPUT');
  });
});
