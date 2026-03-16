import { useState, useEffect, useCallback, useMemo } from 'react';
import { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type FinancialEntry, type FinancialFiltersState } from '../types';

const MOCK_ENTRIES: FinancialEntry[] = [
  { id: 'fin-01', tenantId: 't-1', appointmentCode: 'VIST-001', entryType: FinancialEntryType.TENANT_DEBIT, amount: -350, currency: 'BRL', status: FinancialEntryStatus.APPROVED, description: 'Débito vistoria residencial Centro', relatedEntityName: 'Imobiliária Centro', effectiveAt: '2026-03-15T00:00:00Z', approvedByName: 'Admin Principal', createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:00:00Z' },
  { id: 'fin-02', tenantId: 't-1', appointmentCode: 'VIST-002', entryType: FinancialEntryType.TENANT_DEBIT, amount: -420, currency: 'BRL', status: FinancialEntryStatus.PENDING, description: 'Débito vistoria comercial Paulista', relatedEntityName: 'Imobiliária Paulista', effectiveAt: '2026-03-14T00:00:00Z', approvedByName: null, createdAt: '2026-03-14T10:00:00Z', updatedAt: '2026-03-14T10:00:00Z' },
  { id: 'fin-03', tenantId: 't-2', appointmentCode: 'VIST-003', entryType: FinancialEntryType.TENANT_DEBIT, amount: -280, currency: 'BRL', status: FinancialEntryStatus.APPROVED, description: 'Débito vistoria apartamento Vila Mariana', relatedEntityName: 'Realty Premium', effectiveAt: '2026-03-13T00:00:00Z', approvedByName: 'Admin Principal', createdAt: '2026-03-13T10:00:00Z', updatedAt: '2026-03-13T10:00:00Z' },
  { id: 'fin-04', tenantId: 't-1', appointmentCode: 'VIST-004', entryType: FinancialEntryType.INSPECTOR_PAYOUT, amount: -175, currency: 'BRL', status: FinancialEntryStatus.APPROVED, description: 'Pagamento inspetor Diego - vistoria Centro', relatedEntityName: 'Diego Inspetor', effectiveAt: '2026-03-15T00:00:00Z', approvedByName: 'Carlos Operador', createdAt: '2026-03-15T11:00:00Z', updatedAt: '2026-03-15T11:00:00Z' },
  { id: 'fin-05', tenantId: 't-1', appointmentCode: 'VIST-005', entryType: FinancialEntryType.INSPECTOR_PAYOUT, amount: -210, currency: 'BRL', status: FinancialEntryStatus.PENDING, description: 'Pagamento inspetor Camila - vistoria Paulista', relatedEntityName: 'Camila Inspetora', effectiveAt: '2026-03-14T00:00:00Z', approvedByName: null, createdAt: '2026-03-14T11:00:00Z', updatedAt: '2026-03-14T11:00:00Z' },
  { id: 'fin-06', tenantId: 't-2', appointmentCode: 'VIST-006', entryType: FinancialEntryType.INSPECTOR_PAYOUT, amount: -140, currency: 'BRL', status: FinancialEntryStatus.CANCELLED, description: 'Pagamento inspetor Rafael - cancelado', relatedEntityName: 'Rafael Inspetor', effectiveAt: '2026-03-12T00:00:00Z', approvedByName: null, createdAt: '2026-03-12T11:00:00Z', updatedAt: '2026-03-12T15:00:00Z' },
  { id: 'fin-07', tenantId: 't-1', appointmentCode: 'VIST-007', entryType: FinancialEntryType.REFUND, amount: 350, currency: 'BRL', status: FinancialEntryStatus.APPROVED, description: 'Reembolso vistoria não realizada Centro', relatedEntityName: 'Imobiliária Centro', effectiveAt: '2026-03-11T00:00:00Z', approvedByName: 'Admin Principal', createdAt: '2026-03-11T10:00:00Z', updatedAt: '2026-03-11T10:00:00Z' },
  { id: 'fin-08', tenantId: 't-1', appointmentCode: 'VIST-008', entryType: FinancialEntryType.REFUND, amount: 210, currency: 'BRL', status: FinancialEntryStatus.PENDING, description: 'Reembolso parcial Paulista', relatedEntityName: 'Imobiliária Paulista', effectiveAt: '2026-03-10T00:00:00Z', approvedByName: null, createdAt: '2026-03-10T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z' },
  { id: 'fin-09', tenantId: 't-2', appointmentCode: 'VIST-009', entryType: FinancialEntryType.REFUND, amount: 180, currency: 'BRL', status: FinancialEntryStatus.PENDING, description: 'Reembolso vistoria Vila Mariana', relatedEntityName: 'Realty Premium', effectiveAt: '2026-03-09T00:00:00Z', approvedByName: null, createdAt: '2026-03-09T10:00:00Z', updatedAt: '2026-03-09T10:00:00Z' },
  { id: 'fin-10', tenantId: 't-1', appointmentCode: 'VIST-010', entryType: FinancialEntryType.MANUAL_ADJUSTMENT, amount: 50, currency: 'BRL', status: FinancialEntryStatus.APPROVED, description: 'Ajuste compensação atraso', relatedEntityName: 'Imobiliária Centro', effectiveAt: '2026-03-08T00:00:00Z', approvedByName: 'Admin Principal', createdAt: '2026-03-08T10:00:00Z', updatedAt: '2026-03-08T10:00:00Z' },
  { id: 'fin-11', tenantId: 't-1', appointmentCode: 'VIST-011', entryType: FinancialEntryType.MANUAL_ADJUSTMENT, amount: -30, currency: 'BRL', status: FinancialEntryStatus.APPROVED, description: 'Ajuste correção valor Paulista', relatedEntityName: 'Imobiliária Paulista', effectiveAt: '2026-03-07T00:00:00Z', approvedByName: 'Carlos Operador', createdAt: '2026-03-07T10:00:00Z', updatedAt: '2026-03-07T10:00:00Z' },
  { id: 'fin-12', tenantId: 't-2', appointmentCode: 'VIST-012', entryType: FinancialEntryType.MANUAL_ADJUSTMENT, amount: 100, currency: 'BRL', status: FinancialEntryStatus.PENDING, description: 'Ajuste bonificação Realty', relatedEntityName: 'Realty Premium', effectiveAt: '2026-03-06T00:00:00Z', approvedByName: null, createdAt: '2026-03-06T10:00:00Z', updatedAt: '2026-03-06T10:00:00Z' },
];

function filterEntries(
  data: FinancialEntry[],
  filters: FinancialFiltersState,
): FinancialEntry[] {
  return data.filter((entry) => {
    if (filters.entryType && entry.entryType !== filters.entryType) return false;
    if (filters.status && entry.status !== filters.status) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        entry.description.toLowerCase().includes(term) ||
        entry.appointmentCode.toLowerCase().includes(term);
      if (!matches) return false;
    }

    return true;
  });
}

function sortEntries(
  data: FinancialEntry[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): FinancialEntry[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseFinancialListReturn {
  data: FinancialEntry[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: FinancialFiltersState;
  setFilters: (filters: FinancialFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useFinancialList(): UseFinancialListReturn {
  const [filters, setFilters] = useState<FinancialFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('effectiveAt');
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
    () => filterEntries(MOCK_ENTRIES, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortEntries(filtered, sortBy, sortOrder),
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
