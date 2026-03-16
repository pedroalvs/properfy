import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FinancialFilters } from './FinancialFilters';
import { DEFAULT_FILTERS } from '../types';

describe('FinancialFilters', () => {
  it('renders all 3 filter controls', () => {
    render(
      <FinancialFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('type select ("Tipo") shows "Todos" plus 4 type labels', async () => {
    const user = userEvent.setup();
    render(
      <FinancialFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Tipo'));
    const listbox = screen.getByRole('listbox', { name: 'Tipo' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Débito Inquilino')).toBeInTheDocument();
    expect(screen.getByText('Pagamento Inspetor')).toBeInTheDocument();
    expect(screen.getByText('Reembolso')).toBeInTheDocument();
    expect(screen.getByText('Ajuste Manual')).toBeInTheDocument();
  });

  it('status select shows "Todos" plus 3 status labels', async () => {
    const user = userEvent.setup();
    render(
      <FinancialFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });

  it('calls onFiltersChange on type selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FinancialFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Tipo'));
    await user.click(screen.getByText('Reembolso'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, entryType: 'REFUND' });
  });

  it('search input accessible via "Buscar"', () => {
    render(
      <FinancialFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Buscar');
    expect(input.tagName).toBe('INPUT');
  });
});
