import { useState, useEffect, useCallback, useMemo } from 'react';
import { PropertyType, GeocodingStatus } from '@properfy/shared';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Property, type PropertyFiltersState } from '../types';

const MOCK_PROPERTIES: Property[] = [
  { id: 'prop-01', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro', propertyCode: 'IMV-001', type: PropertyType.RESIDENTIAL, street: 'Rua das Flores, 123', addressLine2: 'Apto 42', suburb: 'Centro', postcode: '01001-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-10T10:00:00Z', updatedAt: '2026-01-10T10:00:00Z' },
  { id: 'prop-02', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro', propertyCode: 'IMV-002', type: PropertyType.COMMERCIAL, street: 'Av. Paulista, 1000', addressLine2: 'Sala 301', suburb: 'Bela Vista', postcode: '01310-100', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-11T10:00:00Z', updatedAt: '2026-01-11T10:00:00Z' },
  { id: 'prop-03', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte', propertyCode: 'IMV-003', type: PropertyType.RESIDENTIAL, street: 'Rua Augusta, 500', addressLine2: null, suburb: 'Consolação', postcode: '01305-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-12T10:00:00Z', updatedAt: '2026-01-12T10:00:00Z' },
  { id: 'prop-04', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro', propertyCode: 'IMV-004', type: PropertyType.INDUSTRIAL, street: 'Rod. Anchieta, km 20', addressLine2: 'Galpão 5', suburb: 'Distrito Industrial', postcode: '09750-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.PENDING, notes: 'Acesso restrito', createdAt: '2026-01-13T10:00:00Z', updatedAt: '2026-01-13T10:00:00Z' },
  { id: 'prop-05', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte', propertyCode: 'IMV-005', type: PropertyType.RURAL, street: 'Estrada do Campo, s/n', addressLine2: null, suburb: 'Zona Rural', postcode: '13500-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.MANUAL, notes: null, createdAt: '2026-01-14T10:00:00Z', updatedAt: '2026-01-14T10:00:00Z' },
  { id: 'prop-06', tenantId: 'tenant-1', branchId: null, branchName: null, propertyCode: 'IMV-006', type: PropertyType.RESIDENTIAL, street: 'Rua Oscar Freire, 200', addressLine2: 'Cobertura', suburb: 'Jardins', postcode: '01426-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-15T10:00:00Z', updatedAt: '2026-01-15T10:00:00Z' },
  { id: 'prop-07', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro', propertyCode: 'IMV-007', type: PropertyType.COMMERCIAL, street: 'Av. Brasil, 2000', addressLine2: 'Loja 12', suburb: 'República', postcode: '01430-001', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-16T10:00:00Z', updatedAt: '2026-01-16T10:00:00Z' },
  { id: 'prop-08', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte', propertyCode: 'IMV-008', type: PropertyType.RESIDENTIAL, street: 'Rua Bela Cintra, 450', addressLine2: null, suburb: 'Consolação', postcode: '01415-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-17T10:00:00Z', updatedAt: '2026-01-17T10:00:00Z' },
  { id: 'prop-09', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro', propertyCode: 'IMV-009', type: PropertyType.RESIDENTIAL, street: 'Alameda Santos, 800', addressLine2: 'Apto 101', suburb: 'Cerqueira César', postcode: '01418-100', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-18T10:00:00Z', updatedAt: '2026-01-18T10:00:00Z' },
  { id: 'prop-10', tenantId: 'tenant-1', branchId: null, branchName: null, propertyCode: 'IMV-010', type: PropertyType.COMMERCIAL, street: 'Rua Haddock Lobo, 300', addressLine2: null, suburb: 'Cerqueira César', postcode: '01414-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.FAILED, notes: 'Verificar endereço', createdAt: '2026-01-19T10:00:00Z', updatedAt: '2026-01-19T10:00:00Z' },
  { id: 'prop-11', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte', propertyCode: 'IMV-011', type: PropertyType.INDUSTRIAL, street: 'Av. do Estado, 5000', addressLine2: 'Bloco B', suburb: 'Cambuci', postcode: '01516-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-20T10:00:00Z', updatedAt: '2026-01-20T10:00:00Z' },
  { id: 'prop-12', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro', propertyCode: 'IMV-012', type: PropertyType.RESIDENTIAL, street: 'Rua Pamplona, 250', addressLine2: null, suburb: 'Jardim Paulista', postcode: '01405-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-21T10:00:00Z', updatedAt: '2026-01-21T10:00:00Z' },
  { id: 'prop-13', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte', propertyCode: 'IMV-013', type: PropertyType.RURAL, street: 'Estrada da Fazenda, km 5', addressLine2: null, suburb: 'Zona Rural Norte', postcode: '13600-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.MANUAL, notes: null, createdAt: '2026-01-22T10:00:00Z', updatedAt: '2026-01-22T10:00:00Z' },
  { id: 'prop-14', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro', propertyCode: 'IMV-014', type: PropertyType.COMMERCIAL, street: 'Av. Angélica, 1800', addressLine2: 'Andar 10', suburb: 'Santa Cecília', postcode: '01228-200', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-23T10:00:00Z', updatedAt: '2026-01-23T10:00:00Z' },
  { id: 'prop-15', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte', propertyCode: 'IMV-015', type: PropertyType.RESIDENTIAL, street: 'Rua da Consolação, 3000', addressLine2: 'Apto 85', suburb: 'Higienópolis', postcode: '01301-000', state: 'SP', country: 'BR', geocodingStatus: GeocodingStatus.SUCCESS, notes: null, createdAt: '2026-01-24T10:00:00Z', updatedAt: '2026-01-24T10:00:00Z' },
];

function filterProperties(
  data: Property[],
  filters: PropertyFiltersState,
): Property[] {
  return data.filter((prop) => {
    if (filters.type && prop.type !== filters.type) return false;

    if (filters.branchId && prop.branchId !== filters.branchId) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        prop.propertyCode.toLowerCase().includes(term) ||
        prop.street.toLowerCase().includes(term) ||
        prop.suburb.toLowerCase().includes(term);
      if (!matches) return false;
    }

    return true;
  });
}

function sortProperties(
  data: Property[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): Property[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UsePropertyListReturn {
  data: Property[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: PropertyFiltersState;
  setFilters: (filters: PropertyFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function usePropertyList(): UsePropertyListReturn {
  const [filters, setFilters] = useState<PropertyFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('propertyCode');
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
    () => filterProperties(MOCK_PROPERTIES, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortProperties(filtered, sortBy, sortOrder),
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
