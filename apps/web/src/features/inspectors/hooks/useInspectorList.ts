import { useState, useEffect, useCallback, useMemo } from 'react';
import { InspectorStatus } from '@properfy/shared';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Inspector, type InspectorFiltersState } from '../types';

const MOCK_INSPECTORS: Inspector[] = [
  { id: 'insp-01', name: 'Carlos Silva', email: 'carlos@inspecoes.com', phone: '11999999999', status: InspectorStatus.ACTIVE, regionsCount: 3, serviceTypesCount: 5, createdAt: '2026-01-10T10:00:00Z', updatedAt: '2026-01-10T10:00:00Z' },
  { id: 'insp-02', name: 'Fernanda Oliveira', email: 'fernanda@inspecoes.com', phone: '11988888888', status: InspectorStatus.ACTIVE, regionsCount: 2, serviceTypesCount: 4, createdAt: '2026-01-11T10:00:00Z', updatedAt: '2026-01-11T10:00:00Z' },
  { id: 'insp-03', name: 'Roberto Alves', email: 'roberto@inspecoes.com', phone: '11977777777', status: InspectorStatus.ACTIVE, regionsCount: 5, serviceTypesCount: 3, createdAt: '2026-01-12T10:00:00Z', updatedAt: '2026-01-12T10:00:00Z' },
  { id: 'insp-04', name: 'Ana Costa', email: 'ana@inspecoes.com', phone: null, status: InspectorStatus.INACTIVE, regionsCount: 0, serviceTypesCount: 0, createdAt: '2026-01-13T10:00:00Z', updatedAt: '2026-02-01T10:00:00Z' },
  { id: 'insp-05', name: 'Marcos Santos', email: 'marcos@inspecoes.com', phone: '11955555555', status: InspectorStatus.ACTIVE, regionsCount: 4, serviceTypesCount: 6, createdAt: '2026-01-14T10:00:00Z', updatedAt: '2026-01-14T10:00:00Z' },
  { id: 'insp-06', name: 'Juliana Martins', email: 'juliana@inspecoes.com', phone: '11944444444', status: InspectorStatus.ACTIVE, regionsCount: 2, serviceTypesCount: 3, createdAt: '2026-01-15T10:00:00Z', updatedAt: '2026-01-15T10:00:00Z' },
  { id: 'insp-07', name: 'Diego Nascimento', email: 'diego@inspecoes.com', phone: null, status: InspectorStatus.INACTIVE, regionsCount: 1, serviceTypesCount: 2, createdAt: '2026-01-16T10:00:00Z', updatedAt: '2026-02-05T10:00:00Z' },
  { id: 'insp-08', name: 'Priscila Nunes', email: 'priscila@inspecoes.com', phone: '11922222222', status: InspectorStatus.ACTIVE, regionsCount: 3, serviceTypesCount: 4, createdAt: '2026-01-17T10:00:00Z', updatedAt: '2026-01-17T10:00:00Z' },
  { id: 'insp-09', name: 'Thiago Ferreira', email: 'thiago@inspecoes.com', phone: '11911111111', status: InspectorStatus.ACTIVE, regionsCount: 6, serviceTypesCount: 5, createdAt: '2026-01-18T10:00:00Z', updatedAt: '2026-01-18T10:00:00Z' },
  { id: 'insp-10', name: 'Camila Barbosa', email: 'camila@inspecoes.com', phone: '11900000000', status: InspectorStatus.ACTIVE, regionsCount: 2, serviceTypesCount: 3, createdAt: '2026-01-19T10:00:00Z', updatedAt: '2026-01-19T10:00:00Z' },
  { id: 'insp-11', name: 'Rafael Moreira', email: 'rafael@inspecoes.com', phone: '11898989898', status: InspectorStatus.ACTIVE, regionsCount: 4, serviceTypesCount: 7, createdAt: '2026-01-20T10:00:00Z', updatedAt: '2026-01-20T10:00:00Z' },
  { id: 'insp-12', name: 'Patricia Lima', email: 'patricia@inspecoes.com', phone: null, status: InspectorStatus.INACTIVE, regionsCount: 0, serviceTypesCount: 1, createdAt: '2026-01-21T10:00:00Z', updatedAt: '2026-02-10T10:00:00Z' },
  { id: 'insp-13', name: 'Lucas Mendes', email: 'lucas@inspecoes.com', phone: '11876767676', status: InspectorStatus.ACTIVE, regionsCount: 3, serviceTypesCount: 4, createdAt: '2026-01-22T10:00:00Z', updatedAt: '2026-01-22T10:00:00Z' },
  { id: 'insp-14', name: 'Beatriz Rodrigues', email: 'beatriz@inspecoes.com', phone: '11865656565', status: InspectorStatus.ACTIVE, regionsCount: 5, serviceTypesCount: 6, createdAt: '2026-01-23T10:00:00Z', updatedAt: '2026-01-23T10:00:00Z' },
  { id: 'insp-15', name: 'Gabriel Souza', email: 'gabriel@inspecoes.com', phone: '11854545454', status: InspectorStatus.ACTIVE, regionsCount: 1, serviceTypesCount: 2, createdAt: '2026-01-24T10:00:00Z', updatedAt: '2026-01-24T10:00:00Z' },
];

function filterInspectors(
  data: Inspector[],
  filters: InspectorFiltersState,
): Inspector[] {
  return data.filter((insp) => {
    if (filters.status && insp.status !== filters.status) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        insp.name.toLowerCase().includes(term) ||
        insp.email.toLowerCase().includes(term) ||
        (insp.phone?.toLowerCase().includes(term) ?? false);
      if (!matches) return false;
    }

    return true;
  });
}

function sortInspectors(
  data: Inspector[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): Inspector[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseInspectorListReturn {
  data: Inspector[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: InspectorFiltersState;
  setFilters: (filters: InspectorFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useInspectorList(): UseInspectorListReturn {
  const [filters, setFilters] = useState<InspectorFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const simulateLoad = useCallback(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return simulateLoad();
  }, [simulateLoad]);

  const filtered = useMemo(
    () => filterInspectors(MOCK_INSPECTORS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortInspectors(filtered, sortBy, sortOrder),
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
