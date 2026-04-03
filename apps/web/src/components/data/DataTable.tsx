import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  hideOnMobile?: boolean;
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  defaultSort?: { key: string; order: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  keyExtractor?: (row: T, index: number) => string;
}

function compareValues(a: unknown, b: unknown, order: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  let result: number;
  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b;
  } else if (typeof a === 'boolean' && typeof b === 'boolean') {
    result = Number(a) - Number(b);
  } else {
    result = String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  }

  return order === 'asc' ? result : -result;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

function alignClass(align?: 'left' | 'center' | 'right') {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

function isMobileViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  error,
  onRetryError,
  pagination,
  defaultSort,
  onRowClick,
  emptyMessage = 'No records found',
  keyExtractor,
}: DataTableProps<T>) {
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const [sortBy, setSortBy] = useState(defaultSort?.key ?? '');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(defaultSort?.order ?? 'asc');
  const colSpan = columns.length;
  const mobileColumns = columns.filter((column) => !column.hideOnMobile);
  const mobileDataColumns = mobileColumns.filter((column) => column.label.trim() !== '');
  const mobileActionColumns = mobileColumns.filter((column) => column.label.trim() === '');

  const sortedData = useMemo(() => {
    if (!sortBy) return data;
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortBy];
      const bVal = (b as Record<string, unknown>)[sortBy];
      return compareValues(aVal, bVal, sortOrder);
    });
  }, [data, sortBy, sortOrder]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const sync = (matches: boolean) => setIsMobile(matches);

    sync(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      const listener = (event: MediaQueryListEvent) => sync(event.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }

    const legacyListener = (event: MediaQueryListEvent) => sync(event.matches);
    mediaQuery.addListener(legacyListener);
    return () => mediaQuery.removeListener(legacyListener);
  }, []);

  function handleSort(columnKey: string) {
    const newOrder = sortBy === columnKey && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(columnKey);
    setSortOrder(newOrder);
  }

  function renderCellValue(row: T, column: DataTableColumn<T>, index: number): ReactNode {
    if (column.render) return column.render(row, index);
    return String((row as Record<string, unknown>)[column.key] ?? '');
  }

  function renderPaginationInfo() {
    if (!pagination) return null;
    const { page, pageSize, total } = pagination;
    const totalPages = Math.ceil(total / pageSize);

    return (
      <div className="mt-4 flex flex-col gap-3 rounded-md border border-border-subtle bg-card-bg px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:py-2">
        <div className="flex items-center gap-3">
          <select
            value={pageSize}
            onChange={(e) => pagination.onChange(1, Number(e.target.value))}
            className="rounded border-none bg-transparent py-1 text-sm text-text-primary outline-none"
            aria-label="Items per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
          <span className="text-sm text-text-secondary">
            Showing {Math.min((page - 1) * pageSize + 1, total)}-{Math.min(page * pageSize, total)} of {total}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          <button
            onClick={() => pagination.onChange(page - 1, pageSize)}
            disabled={page <= 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-text-primary hover:bg-black/5 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Previous page"
          >
            <i className="mdi mdi-chevron-left text-lg" />
          </button>

          <div className="flex items-center gap-1.5 text-sm text-text-secondary">
            <input
              type="text"
              value={page}
              onChange={(e) => {
                const p = parseInt(e.target.value, 10);
                if (!isNaN(p) && p >= 1 && p <= totalPages) {
                  pagination.onChange(p, pageSize);
                }
              }}
              className="h-7 w-10 rounded border border-border-subtle bg-transparent text-center text-sm text-text-primary outline-none focus:border-primary"
              aria-label="Current page"
            />
            <span>of</span>
            <span className="font-medium">{totalPages}</span>
          </div>

          <button
            onClick={() => pagination.onChange(page + 1, pageSize)}
            disabled={page >= totalPages}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-text-primary hover:bg-black/5 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Next page"
          >
            <i className="mdi mdi-chevron-right text-lg" />
          </button>
        </div>
      </div>
    );
  }

  function renderMobileRows() {
    if (loading) {
      return (
        <div className="rounded-md border border-[#ddd] px-4 py-6">
          <LoadingState rows={5} />
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-md border border-[#ddd]">
          <ErrorState message={error} onRetry={onRetryError ?? (() => {})} />
        </div>
      );
    }

    if (sortedData.length === 0) {
      return (
        <div className="rounded-md border border-[#ddd]">
          <EmptyState title={emptyMessage} />
        </div>
      );
    }

    return (
      <div className="space-y-3" data-testid="data-table-mobile-list">
        {sortedData.map((row, index) => (
          <div
            key={keyExtractor ? keyExtractor(row, index) : ((row as any).id ?? index)}
            className={`rounded-xl border border-border-subtle bg-card-bg p-4 shadow-sm ${
              onRowClick ? 'cursor-pointer transition-colors hover:bg-hover-row' : ''
            }`}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            data-testid="data-table-mobile-card"
          >
            <div className="space-y-3">
              {mobileDataColumns.map((column) => (
                <div
                  key={column.key}
                  className="flex items-start justify-between gap-3 border-b border-border-light/70 pb-3 last:border-b-0 last:pb-0"
                >
                  <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {column.headerRender ? column.headerRender() : column.label}
                  </span>
                  <div className={`min-w-0 flex-1 text-sm text-text-primary ${alignClass(column.align)}`}>
                    {renderCellValue(row, column, index)}
                  </div>
                </div>
              ))}

              {mobileActionColumns.length > 0 && (
                <div className="flex flex-wrap justify-end gap-2 border-t border-border-light pt-3">
                  {mobileActionColumns.map((column) => (
                    <div key={column.key}>{renderCellValue(row, column, index)}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {isMobile ? (
        renderMobileRows()
      ) : (
        <div className="overflow-x-auto overflow-y-auto rounded-md border border-[#ddd]">
          <table className="w-full min-w-[640px] border-collapse md:min-w-[800px]">
            <thead>
              <tr className="border-b border-border-subtle">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-3 py-3 text-table-header text-text-secondary md:px-4 ${alignClass(col.align)} ${
                      col.sortable ? 'cursor-pointer select-none hover:text-text-primary' : ''
                    } ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.headerRender ? col.headerRender() : col.label}
                      {col.sortable && sortBy === col.key && (
                        <i
                          className={`mdi ${
                            sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down'
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
              {!loading && !error && sortedData.length === 0 && (
                <tr>
                  <td colSpan={colSpan}>
                    <EmptyState title={emptyMessage} />
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                sortedData.map((row, index) => (
                  <tr
                    key={keyExtractor ? keyExtractor(row, index) : ((row as any).id ?? index)}
                    className={`border-b border-border-light text-table-body text-text-primary ${
                      onRowClick ? 'cursor-pointer hover:bg-hover-row' : ''
                    }`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-3 md:px-4 ${alignClass(col.align)} ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}
                      >
                        {renderCellValue(row, col, index)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && sortedData.length > 0 && renderPaginationInfo()}
    </div>
  );
}
