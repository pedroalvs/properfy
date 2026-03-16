import { useState, useEffect, useCallback, useMemo } from 'react';
import { ReportType, ReportStatus, ReportFormat } from '@properfy/shared';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Report, type ReportFiltersState } from '../types';

const MOCK_REPORTS: Report[] = [
  { id: 'rpt-01', reportType: ReportType.INSPECTIONS_SCHEDULED, status: ReportStatus.READY, format: ReportFormat.XLSX, requestedByName: 'Admin Principal', fileName: 'vistorias-agendadas-marco-2026.xlsx', createdAt: '2026-03-15T14:00:00Z', updatedAt: '2026-03-15T14:30:00Z' },
  { id: 'rpt-02', reportType: ReportType.INSPECTIONS_DONE, status: ReportStatus.READY, format: ReportFormat.XLSX, requestedByName: 'Carlos Operador', fileName: 'vistorias-concluidas-marco-2026.xlsx', createdAt: '2026-03-14T10:00:00Z', updatedAt: '2026-03-14T10:15:00Z' },
  { id: 'rpt-03', reportType: ReportType.INSPECTIONS_CANCELLED, status: ReportStatus.READY, format: ReportFormat.XLSX, requestedByName: 'Admin Principal', fileName: 'vistorias-canceladas-fev-2026.xlsx', createdAt: '2026-03-13T09:00:00Z', updatedAt: '2026-03-13T09:20:00Z' },
  { id: 'rpt-04', reportType: ReportType.FINANCIAL_SERVICES, status: ReportStatus.READY, format: ReportFormat.XLSX, requestedByName: 'Fernanda Operadora', fileName: 'financeiro-servicos-marco-2026.xlsx', createdAt: '2026-03-12T16:00:00Z', updatedAt: '2026-03-12T16:10:00Z' },
  { id: 'rpt-05', reportType: ReportType.INSPECTOR_PERFORMANCE, status: ReportStatus.PROCESSING, format: ReportFormat.XLSX, requestedByName: 'Carlos Operador', fileName: null, createdAt: '2026-03-15T15:00:00Z', updatedAt: '2026-03-15T15:00:00Z' },
  { id: 'rpt-06', reportType: ReportType.CONFIRMATION_STATUS, status: ReportStatus.PROCESSING, format: ReportFormat.XLSX, requestedByName: 'Admin Principal', fileName: null, createdAt: '2026-03-15T15:30:00Z', updatedAt: '2026-03-15T15:30:00Z' },
  { id: 'rpt-07', reportType: ReportType.INSPECTIONS_REJECTED, status: ReportStatus.PENDING, format: ReportFormat.XLSX, requestedByName: 'Fernanda Operadora', fileName: null, createdAt: '2026-03-15T16:00:00Z', updatedAt: '2026-03-15T16:00:00Z' },
  { id: 'rpt-08', reportType: ReportType.INSPECTIONS_SCHEDULED, status: ReportStatus.PENDING, format: ReportFormat.XLSX, requestedByName: 'Admin Principal', fileName: null, createdAt: '2026-03-15T16:30:00Z', updatedAt: '2026-03-15T16:30:00Z' },
  { id: 'rpt-09', reportType: ReportType.FINANCIAL_SERVICES, status: ReportStatus.FAILED, format: ReportFormat.XLSX, requestedByName: 'Carlos Operador', fileName: null, createdAt: '2026-03-11T10:00:00Z', updatedAt: '2026-03-11T10:05:00Z' },
  { id: 'rpt-10', reportType: ReportType.INSPECTIONS_DONE, status: ReportStatus.FAILED, format: ReportFormat.XLSX, requestedByName: 'Admin Principal', fileName: null, createdAt: '2026-03-10T14:00:00Z', updatedAt: '2026-03-10T14:02:00Z' },
];

function filterReports(
  data: Report[],
  filters: ReportFiltersState,
): Report[] {
  return data.filter((report) => {
    if (filters.reportType && report.reportType !== filters.reportType) return false;
    if (filters.status && report.status !== filters.status) return false;
    return true;
  });
}

function sortReports(
  data: Report[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): Report[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseReportListReturn {
  data: Report[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ReportFiltersState;
  setFilters: (filters: ReportFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useReportList(): UseReportListReturn {
  const [filters, setFilters] = useState<ReportFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const simulateLoad = useCallback(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return simulateLoad();
  }, [simulateLoad]);

  const filtered = useMemo(
    () => filterReports(MOCK_REPORTS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortReports(filtered, sortBy, sortOrder),
    [filtered, sortBy, sortOrder],
  );

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const pagination: DataTablePagination = {
    page,
    pageSize,
    total: filtered.length,
    onChange: (newPage, newPageSize) => {
      setPage(newPage);
      setPageSize(newPageSize);
    },
  };

  const sorting: DataTableSorting = {
    sortBy,
    sortOrder,
    onChange: (newSortBy, newSortOrder) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
    },
  };

  const refetch = useCallback(() => {
    simulateLoad();
  }, [simulateLoad]);

  return {
    data: isLoading ? [] : paginatedData,
    isLoading,
    isError: false,
    errorMessage: null,
    refetch,
    filters,
    setFilters,
    pagination,
    sorting,
  };
}
