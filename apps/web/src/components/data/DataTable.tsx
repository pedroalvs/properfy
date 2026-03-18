import { type ReactNode } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T, index: number) => ReactNode;
  headerRender?: () => ReactNode;
  sortable?: boolean;
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
}

export interface DataTableSorting {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  keyExtractor?: (row: T, index: number) => string;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function alignClass(align?: 'left' | 'center' | 'right') {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  error,
  onRetryError,
  pagination,
  sorting,
  onRowClick,
  emptyMessage = 'No records found',
  keyExtractor,
}: DataTableProps<T>) {
  const colSpan = columns.length;

  function handleSort(columnKey: string) {
    if (!sorting) return;
    const newOrder =
      sorting.sortBy === columnKey && sorting.sortOrder === 'asc' ? 'desc' : 'asc';
    sorting.onChange(columnKey, newOrder);
  }

  function renderCellValue(row: T, column: DataTableColumn<T>, index: number): ReactNode {
    if (column.render) return column.render(row, index);
    return String((row as Record<string, unknown>)[column.key] ?? '');
  }

  function renderPaginationInfo() {
    if (!pagination) return null;
    const { page, pageSize, total } = pagination;
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    const totalPages = Math.ceil(total / pageSize);

    return (
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-4 py-3">
        <span className="text-sm text-text-secondary">
          {`Showing ${start}–${end} of ${total}`}
        </span>
        <div className="flex items-center gap-4">
          <select
            value={pageSize}
            onChange={(e) => pagination.onChange(1, Number(e.target.value))}
            className="rounded border border-border-subtle bg-white px-2 py-1 text-sm text-text-primary"
            aria-label="Items per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onChange(page - 1, pageSize)}
              disabled={page <= 1}
              className="rounded px-3 py-1 text-sm font-semibold text-primary hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => pagination.onChange(page + 1, pageSize)}
              disabled={page >= totalPages}
              className="rounded px-3 py-1 text-sm font-semibold text-primary hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-subtle">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-table-header text-text-secondary ${alignClass(col.align)} ${
                    col.sortable ? 'cursor-pointer select-none hover:text-text-primary' : ''
                  }`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.headerRender ? col.headerRender() : col.label}
                    {col.sortable && sorting?.sortBy === col.key && (
                      <i
                        className={`mdi ${
                          sorting.sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down'
                        } text-xs`}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6">
                  <LoadingState rows={5} />
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={colSpan}>
                  <ErrorState message={error} onRetry={onRetryError ?? (() => {})} />
                </td>
              </tr>
            )}
            {!loading && !error && data.length === 0 && (
              <tr>
                <td colSpan={colSpan}>
                  <EmptyState title={emptyMessage} />
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              data.map((row, index) => (
                <tr
                  key={keyExtractor ? keyExtractor(row, index) : index}
                  className={`border-b border-border-light text-table-body text-text-primary ${
                    onRowClick ? 'cursor-pointer hover:bg-hover-row' : ''
                  }`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${alignClass(col.align)}`}
                    >
                      {renderCellValue(row, col, index)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!loading && !error && data.length > 0 && renderPaginationInfo()}
    </div>
  );
}
