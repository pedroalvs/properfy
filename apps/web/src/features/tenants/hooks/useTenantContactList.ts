import { useState, useEffect, useCallback, useMemo } from 'react';
import { TenantConfirmationStatus } from '@properfy/shared';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type TenantContact, type TenantContactFiltersState } from '../types';

const MOCK_CONTACTS: TenantContact[] = [
  { id: 'tnt-01', appointmentId: 'apt-01', appointmentCode: 'VIST-101', name: 'Ana Silva', primaryEmail: 'ana.silva@email.com', primaryPhone: '11999000001', confirmationStatus: TenantConfirmationStatus.PENDING, propertyAddress: 'Rua Augusta, 1200 - Centro, São Paulo', appointmentDate: '2026-03-20T14:00:00Z', lastActivityAt: null, createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:00:00Z' },
  { id: 'tnt-02', appointmentId: 'apt-02', appointmentCode: 'VIST-102', name: 'Bruno Costa', primaryEmail: 'bruno@email.com', primaryPhone: null, confirmationStatus: TenantConfirmationStatus.PENDING, propertyAddress: 'Av. Paulista, 900 - Bela Vista, São Paulo', appointmentDate: '2026-03-19T14:00:00Z', lastActivityAt: '2026-03-16T08:00:00Z', createdAt: '2026-03-14T10:00:00Z', updatedAt: '2026-03-16T08:00:00Z' },
  { id: 'tnt-03', appointmentId: 'apt-03', appointmentCode: 'VIST-103', name: 'Carla Mendes', primaryEmail: null, primaryPhone: '11988000003', confirmationStatus: TenantConfirmationStatus.PENDING, propertyAddress: 'Rua Oscar Freire, 500 - Jardins, São Paulo', appointmentDate: '2026-03-18T14:00:00Z', lastActivityAt: null, createdAt: '2026-03-13T10:00:00Z', updatedAt: '2026-03-13T10:00:00Z' },
  { id: 'tnt-04', appointmentId: 'apt-04', appointmentCode: 'VIST-104', name: 'Diego Ferreira', primaryEmail: 'diego.f@email.com', primaryPhone: '11977000004', confirmationStatus: TenantConfirmationStatus.PENDING, propertyAddress: 'Rua Haddock Lobo, 300 - Cerqueira César, São Paulo', appointmentDate: '2026-03-17T14:00:00Z', lastActivityAt: null, createdAt: '2026-03-12T10:00:00Z', updatedAt: '2026-03-12T10:00:00Z' },
  { id: 'tnt-05', appointmentId: 'apt-05', appointmentCode: 'VIST-105', name: 'Elena Rocha', primaryEmail: 'elena@email.com', primaryPhone: '11966000005', confirmationStatus: TenantConfirmationStatus.CONFIRMED, propertyAddress: 'Rua da Consolação, 2000 - Consolação, São Paulo', appointmentDate: '2026-03-14T14:00:00Z', lastActivityAt: '2026-03-12T15:00:00Z', createdAt: '2026-03-10T10:00:00Z', updatedAt: '2026-03-12T15:00:00Z' },
  { id: 'tnt-06', appointmentId: 'apt-06', appointmentCode: 'VIST-106', name: 'Felipe Santos', primaryEmail: 'felipe.s@email.com', primaryPhone: null, confirmationStatus: TenantConfirmationStatus.CONFIRMED, propertyAddress: 'Av. Rebouças, 1500 - Pinheiros, São Paulo', appointmentDate: '2026-03-13T14:00:00Z', lastActivityAt: '2026-03-11T10:00:00Z', createdAt: '2026-03-09T10:00:00Z', updatedAt: '2026-03-11T10:00:00Z' },
  { id: 'tnt-07', appointmentId: 'apt-07', appointmentCode: 'VIST-107', name: 'Gabriela Lima', primaryEmail: 'gabi@email.com', primaryPhone: '11955000007', confirmationStatus: TenantConfirmationStatus.CONFIRMED, propertyAddress: 'Rua Frei Caneca, 800 - Bela Vista, São Paulo', appointmentDate: '2026-03-12T14:00:00Z', lastActivityAt: '2026-03-10T09:00:00Z', createdAt: '2026-03-08T10:00:00Z', updatedAt: '2026-03-10T09:00:00Z' },
  { id: 'tnt-08', appointmentId: 'apt-08', appointmentCode: 'VIST-108', name: 'Henrique Alves', primaryEmail: 'henrique@email.com', primaryPhone: '11944000008', confirmationStatus: TenantConfirmationStatus.CONFIRMED, propertyAddress: 'Rua Bela Cintra, 600 - Jardins, São Paulo', appointmentDate: '2026-03-11T14:00:00Z', lastActivityAt: '2026-03-09T14:00:00Z', createdAt: '2026-03-07T10:00:00Z', updatedAt: '2026-03-09T14:00:00Z' },
  { id: 'tnt-09', appointmentId: 'apt-09', appointmentCode: 'VIST-109', name: 'Isabela Martins', primaryEmail: 'isabela@email.com', primaryPhone: '11933000009', confirmationStatus: TenantConfirmationStatus.UNAVAILABLE, propertyAddress: 'Av. Brigadeiro Faria Lima, 3000 - Itaim, São Paulo', appointmentDate: '2026-03-10T14:00:00Z', lastActivityAt: '2026-03-08T11:00:00Z', createdAt: '2026-03-06T10:00:00Z', updatedAt: '2026-03-08T11:00:00Z' },
  { id: 'tnt-10', appointmentId: 'apt-10', appointmentCode: 'VIST-110', name: 'João Pereira', primaryEmail: null, primaryPhone: '11922000010', confirmationStatus: TenantConfirmationStatus.UNAVAILABLE, propertyAddress: 'Rua dos Pinheiros, 700 - Pinheiros, São Paulo', appointmentDate: '2026-03-09T14:00:00Z', lastActivityAt: '2026-03-07T16:00:00Z', createdAt: '2026-03-05T10:00:00Z', updatedAt: '2026-03-07T16:00:00Z' },
  { id: 'tnt-11', appointmentId: 'apt-11', appointmentCode: 'VIST-111', name: 'Karen Oliveira', primaryEmail: 'karen@email.com', primaryPhone: '11911000011', confirmationStatus: TenantConfirmationStatus.NO_RESPONSE, propertyAddress: 'Rua Pamplona, 400 - Jardim Paulista, São Paulo', appointmentDate: '2026-03-05T14:00:00Z', lastActivityAt: null, createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z' },
  { id: 'tnt-12', appointmentId: 'apt-12', appointmentCode: 'VIST-112', name: 'Lucas Barbosa', primaryEmail: 'lucas.b@email.com', primaryPhone: null, confirmationStatus: TenantConfirmationStatus.NO_RESPONSE, propertyAddress: 'Av. Angélica, 1800 - Santa Cecília, São Paulo', appointmentDate: '2026-03-03T14:00:00Z', lastActivityAt: null, createdAt: '2026-02-28T10:00:00Z', updatedAt: '2026-02-28T10:00:00Z' },
];

function filterContacts(
  data: TenantContact[],
  filters: TenantContactFiltersState,
): TenantContact[] {
  return data.filter((contact) => {
    if (filters.confirmationStatus && contact.confirmationStatus !== filters.confirmationStatus) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        contact.name.toLowerCase().includes(term) ||
        (contact.primaryEmail?.toLowerCase().includes(term) ?? false) ||
        (contact.primaryPhone?.toLowerCase().includes(term) ?? false);
      if (!matches) return false;
    }

    return true;
  });
}

function sortContacts(
  data: TenantContact[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): TenantContact[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseTenantContactListReturn {
  data: TenantContact[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: TenantContactFiltersState;
  setFilters: (filters: TenantContactFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useTenantContactList(): UseTenantContactListReturn {
  const [filters, setFilters] = useState<TenantContactFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('appointmentDate');
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
    () => filterContacts(MOCK_CONTACTS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortContacts(filtered, sortBy, sortOrder),
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
