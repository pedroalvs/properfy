import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type DataTableColumn } from './DataTable';

interface TestRow {
  id: number;
  name: string;
  status: string;
}

const columns: DataTableColumn<TestRow>[] = [
  { key: 'id', label: 'ID', width: '60px' },
  { key: 'name', label: 'Nome' },
  { key: 'status', label: 'Status' },
];

const data: TestRow[] = [
  { id: 1, name: 'Item A', status: 'ativo' },
  { id: 2, name: 'Item B', status: 'inativo' },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders data rows', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Item A')).toBeInTheDocument();
    expect(screen.getByText('Item B')).toBeInTheDocument();
  });

  it('renders custom cell via render prop', () => {
    const customColumns: DataTableColumn<TestRow>[] = [
      { key: 'name', label: 'Nome', render: (row) => <strong>{row.name}</strong> },
    ];
    render(<DataTable columns={customColumns} data={data} />);
    const strong = screen.getByText('Item A');
    expect(strong.tagName).toBe('STRONG');
  });

  it('shows loading state when loading', () => {
    render(<DataTable columns={columns} data={[]} loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
  });

  it('shows custom empty message', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="Sem resultados" />);
    expect(screen.getByText('Sem resultados')).toBeInTheDocument();
  });

  it('shows error state with retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<DataTable columns={columns} data={[]} error="Falha na conexão" onRetryError={onRetry} />);
    expect(screen.getByText('Falha na conexão')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('handles sorting interaction', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const sortableColumns: DataTableColumn<TestRow>[] = [
      { key: 'name', label: 'Nome', sortable: true },
    ];
    render(
      <DataTable
        columns={sortableColumns}
        data={data}
        sorting={{ sortBy: 'name', sortOrder: 'asc', onChange }}
      />,
    );

    const header = screen.getByText('Nome');
    // Should show ascending indicator
    const headerContainer = header.closest('th')!;
    expect(within(headerContainer).getByText('Nome')).toBeInTheDocument();
    expect(headerContainer.querySelector('.mdi-arrow-up')).toBeTruthy();

    // Click to toggle to desc
    await user.click(header);
    expect(onChange).toHaveBeenCalledWith('name', 'desc');
  });

  it('renders pagination controls', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{ page: 1, pageSize: 10, total: 25, onChange: () => {} }}
      />,
    );
    expect(screen.getByText(/Exibindo 1.10 de 25/)).toBeInTheDocument();
    expect(screen.getByText('Anterior')).toBeDisabled();
    expect(screen.getByText('Próximo')).not.toBeDisabled();
  });

  it('handles pagination page change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{ page: 2, pageSize: 10, total: 25, onChange }}
      />,
    );
    await user.click(screen.getByText('Anterior'));
    expect(onChange).toHaveBeenCalledWith(1, 10);
  });

  it('handles pagination page size change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{ page: 1, pageSize: 10, total: 25, onChange }}
      />,
    );
    await user.selectOptions(screen.getByLabelText('Itens por página'), '20');
    expect(onChange).toHaveBeenCalledWith(1, 20);
  });

  it('calls onRowClick when a row is clicked', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />);
    await user.click(screen.getByText('Item A'));
    expect(onRowClick).toHaveBeenCalledWith(data[0]);
  });

  it('applies hover styles when onRowClick is set', () => {
    render(<DataTable columns={columns} data={data} onRowClick={() => {}} />);
    const row = screen.getByText('Item A').closest('tr')!;
    expect(row.className).toContain('cursor-pointer');
    expect(row.className).toContain('hover:bg-[#FAFAFA]');
  });
});
