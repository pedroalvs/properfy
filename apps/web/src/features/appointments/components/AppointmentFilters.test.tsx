import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentFilters } from './AppointmentFilters';
import { DEFAULT_FILTERS } from '../types';
import type { FilterSelectOption } from '@/components/filters/FilterSelect';

const branchOptions: FilterSelectOption[] = [
  { label: 'Todas', value: '' },
  { label: 'Filial Centro', value: 'branch-1' },
];

describe('AppointmentFilters', () => {
  it('renders all 5 filter controls', () => {
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
      />,
    );
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filial')).toBeInTheDocument();
    expect(screen.getByLabelText('Período - início')).toBeInTheDocument();
    expect(screen.getByLabelText('Período - fim')).toBeInTheDocument();
    expect(screen.getByLabelText('Exibir cancelados')).toBeInTheDocument();
  });

  it('renders search input accessible via label "Buscar"', () => {
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
      />,
    );
    const input = screen.getByLabelText('Buscar');
    expect(input.tagName).toBe('INPUT');
  });

  it('renders status select with all 6 status labels plus "Todos"', async () => {
    const user = userEvent.setup();
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByText('Aguardando Inspetor')).toBeInTheDocument();
    expect(screen.getByText('Agendado')).toBeInTheDocument();
    expect(screen.getByText('Concluído')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    expect(screen.getByText('Rejeitado')).toBeInTheDocument();
  });

  it('renders "Exibir cancelados" boolean toggle', () => {
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
      />,
    );
    const checkbox = screen.getByLabelText('Exibir cancelados');
    expect(checkbox).not.toBeChecked();
  });

  it('calls onFiltersChange when boolean toggle is changed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
        branchOptions={branchOptions}
      />,
    );
    await user.click(screen.getByLabelText('Exibir cancelados'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, showCancelled: true });
  });

  it('calls onFiltersChange when status is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
        branchOptions={branchOptions}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    await user.click(screen.getByText('Agendado'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'SCHEDULED' });
  });
});
