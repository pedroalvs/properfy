import { useState, useEffect, useCallback, useMemo } from 'react';
import { ServiceGroupStatus, PriorityMode } from '@properfy/shared';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type ServiceGroup, type ServiceGroupFiltersState } from '../types';

const MOCK_SERVICE_GROUPS: ServiceGroup[] = [
  { id: 'sg-01', tenantId: 't-1', name: 'Zona Sul SP', regionName: 'São Paulo - Sul', inspectorId: 'insp-01', inspectorName: 'Carlos Silva', status: ServiceGroupStatus.PUBLISHED, priorityMode: PriorityMode.STANDARD, appointmentsCount: 8, createdAt: '2026-01-10T10:00:00Z', updatedAt: '2026-01-10T10:00:00Z' },
  { id: 'sg-02', tenantId: 't-1', name: 'Zona Norte SP', regionName: 'São Paulo - Norte', inspectorId: 'insp-02', inspectorName: 'Fernanda Oliveira', status: ServiceGroupStatus.ACCEPTED, priorityMode: PriorityMode.STANDARD, appointmentsCount: 5, createdAt: '2026-01-11T10:00:00Z', updatedAt: '2026-01-11T10:00:00Z' },
  { id: 'sg-03', tenantId: 't-1', name: 'Centro RJ', regionName: 'Rio de Janeiro - Centro', inspectorId: null, inspectorName: null, status: ServiceGroupStatus.DRAFT, priorityMode: PriorityMode.PRIORITY_24H, appointmentsCount: 0, createdAt: '2026-01-12T10:00:00Z', updatedAt: '2026-01-12T10:00:00Z' },
  { id: 'sg-04', tenantId: 't-2', name: 'Barra da Tijuca', regionName: 'Rio de Janeiro - Barra', inspectorId: 'insp-03', inspectorName: 'Roberto Alves', status: ServiceGroupStatus.PUBLISHED, priorityMode: PriorityMode.STANDARD, appointmentsCount: 12, createdAt: '2026-01-13T10:00:00Z', updatedAt: '2026-01-13T10:00:00Z' },
  { id: 'sg-05', tenantId: 't-2', name: 'Campinas Interior', regionName: null, inspectorId: 'insp-05', inspectorName: 'Marcos Santos', status: ServiceGroupStatus.ACCEPTED, priorityMode: PriorityMode.PRIORITY_24H, appointmentsCount: 3, createdAt: '2026-01-14T10:00:00Z', updatedAt: '2026-01-14T10:00:00Z' },
  { id: 'sg-06', tenantId: 't-1', name: 'Zona Oeste SP', regionName: 'São Paulo - Oeste', inspectorId: null, inspectorName: null, status: ServiceGroupStatus.CANCELLED, priorityMode: PriorityMode.STANDARD, appointmentsCount: 0, createdAt: '2026-01-15T10:00:00Z', updatedAt: '2026-02-01T10:00:00Z' },
  { id: 'sg-07', tenantId: 't-3', name: 'Curitiba Centro', regionName: 'Curitiba - Centro', inspectorId: 'insp-06', inspectorName: 'Juliana Martins', status: ServiceGroupStatus.PUBLISHED, priorityMode: PriorityMode.STANDARD, appointmentsCount: 7, createdAt: '2026-01-16T10:00:00Z', updatedAt: '2026-01-16T10:00:00Z' },
  { id: 'sg-08', tenantId: 't-3', name: 'Florianópolis', regionName: 'Florianópolis - Ilha', inspectorId: 'insp-08', inspectorName: 'Priscila Nunes', status: ServiceGroupStatus.ACCEPTED, priorityMode: PriorityMode.STANDARD, appointmentsCount: 4, createdAt: '2026-01-17T10:00:00Z', updatedAt: '2026-01-17T10:00:00Z' },
  { id: 'sg-09', tenantId: 't-1', name: 'ABC Paulista', regionName: 'São Paulo - ABC', inspectorId: 'insp-09', inspectorName: 'Thiago Ferreira', status: ServiceGroupStatus.DRAFT, priorityMode: PriorityMode.STANDARD, appointmentsCount: 0, createdAt: '2026-01-18T10:00:00Z', updatedAt: '2026-01-18T10:00:00Z' },
  { id: 'sg-10', tenantId: 't-2', name: 'Niterói', regionName: 'Niterói', inspectorId: null, inspectorName: null, status: ServiceGroupStatus.CANCELLED, priorityMode: PriorityMode.STANDARD, appointmentsCount: 0, createdAt: '2026-01-19T10:00:00Z', updatedAt: '2026-02-05T10:00:00Z' },
  { id: 'sg-11', tenantId: 't-1', name: 'Guarulhos', regionName: null, inspectorId: 'insp-10', inspectorName: 'Camila Barbosa', status: ServiceGroupStatus.PUBLISHED, priorityMode: PriorityMode.PRIORITY_24H, appointmentsCount: 6, createdAt: '2026-01-20T10:00:00Z', updatedAt: '2026-01-20T10:00:00Z' },
  { id: 'sg-12', tenantId: 't-2', name: 'Zona Leste SP', regionName: 'São Paulo - Leste', inspectorId: 'insp-11', inspectorName: 'Rafael Moreira', status: ServiceGroupStatus.ACCEPTED, priorityMode: PriorityMode.STANDARD, appointmentsCount: 9, createdAt: '2026-01-21T10:00:00Z', updatedAt: '2026-01-21T10:00:00Z' },
  { id: 'sg-13', tenantId: 't-3', name: 'Porto Alegre', regionName: 'Porto Alegre - Centro', inspectorId: 'insp-13', inspectorName: 'Lucas Mendes', status: ServiceGroupStatus.DRAFT, priorityMode: PriorityMode.STANDARD, appointmentsCount: 0, createdAt: '2026-01-22T10:00:00Z', updatedAt: '2026-01-22T10:00:00Z' },
  { id: 'sg-14', tenantId: 't-1', name: 'Santos Litoral', regionName: 'Santos', inspectorId: 'insp-14', inspectorName: 'Beatriz Rodrigues', status: ServiceGroupStatus.PUBLISHED, priorityMode: PriorityMode.STANDARD, appointmentsCount: 2, createdAt: '2026-01-23T10:00:00Z', updatedAt: '2026-01-23T10:00:00Z' },
  { id: 'sg-15', tenantId: 't-2', name: 'Sorocaba', regionName: null, inspectorId: null, inspectorName: null, status: ServiceGroupStatus.DRAFT, priorityMode: PriorityMode.PRIORITY_24H, appointmentsCount: 0, createdAt: '2026-01-24T10:00:00Z', updatedAt: '2026-01-24T10:00:00Z' },
];

function filterServiceGroups(
  data: ServiceGroup[],
  filters: ServiceGroupFiltersState,
): ServiceGroup[] {
  return data.filter((sg) => {
    if (filters.status && sg.status !== filters.status) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        sg.name.toLowerCase().includes(term) ||
        (sg.regionName?.toLowerCase().includes(term) ?? false) ||
        (sg.inspectorName?.toLowerCase().includes(term) ?? false);
      if (!matches) return false;
    }

    return true;
  });
}

function sortServiceGroups(
  data: ServiceGroup[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): ServiceGroup[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseServiceGroupListReturn {
  data: ServiceGroup[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ServiceGroupFiltersState;
  setFilters: (filters: ServiceGroupFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useServiceGroupList(): UseServiceGroupListReturn {
  const [filters, setFilters] = useState<ServiceGroupFiltersState>(DEFAULT_FILTERS);
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
    () => filterServiceGroups(MOCK_SERVICE_GROUPS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortServiceGroups(filtered, sortBy, sortOrder),
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
