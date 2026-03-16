import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportFilters } from './ReportFilters';
import { DEFAULT_FILTERS } from '../types';

describe('ReportFilters', () => {
  it('renders both filter controls', () => {
    render(
      <ReportFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('type select shows "Todos" plus 7 type labels', async () => {
    const user = userEvent.setup();
    render(
      <ReportFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Tipo'));
    const listbox = screen.getByRole('listbox', { name: 'Tipo' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Vistorias Agendadas')).toBeInTheDocument();
    expect(screen.getByText('Vistorias Concluídas')).toBeInTheDocument();
    expect(screen.getByText('Vistorias Canceladas')).toBeInTheDocument();
    expect(screen.getByText('Vistorias Rejeitadas')).toBeInTheDocument();
    expect(screen.getByText('Desempenho Inspetores')).toBeInTheDocument();
    expect(screen.getByText('Status Confirmação')).toBeInTheDocument();
    expect(screen.getByText('Serviços Financeiros')).toBeInTheDocument();
  });

  it('status select shows "Todos" plus 4 status labels', async () => {
    const user = userEvent.setup();
    render(
      <ReportFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('Todos');
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Processando')).toBeInTheDocument();
    expect(screen.getByText('Pronto')).toBeInTheDocument();
    expect(screen.getByText('Falhou')).toBeInTheDocument();
  });

  it('calls onFiltersChange on type selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ReportFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Tipo'));
    await user.click(screen.getByText('Vistorias Agendadas'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, reportType: 'INSPECTIONS_SCHEDULED' });
  });
});
