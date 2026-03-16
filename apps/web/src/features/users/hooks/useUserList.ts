import { useState, useEffect, useCallback, useMemo } from 'react';
import { UserRole, UserStatus } from '@properfy/shared';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type User, type UserFiltersState } from '../types';

const MOCK_USERS: User[] = [
  { id: 'usr-01', tenantId: null, branchId: null, branchName: null, role: UserRole.AM, name: 'Admin Principal', email: 'admin@properfy.com', phone: '11999000001', status: UserStatus.ACTIVE, lastLoginAt: '2026-03-15T08:00:00Z', createdAt: '2025-06-01T10:00:00Z', updatedAt: '2026-03-15T08:00:00Z' },
  { id: 'usr-02', tenantId: null, branchId: null, branchName: null, role: UserRole.AM, name: 'Admin Secundário', email: 'admin2@properfy.com', phone: '11999000002', status: UserStatus.ACTIVE, lastLoginAt: '2026-03-14T10:00:00Z', createdAt: '2025-07-01T10:00:00Z', updatedAt: '2026-03-14T10:00:00Z' },
  { id: 'usr-03', tenantId: null, branchId: null, branchName: null, role: UserRole.OP, name: 'Carlos Operador', email: 'carlos@properfy.com', phone: '11999000003', status: UserStatus.ACTIVE, lastLoginAt: '2026-03-15T09:00:00Z', createdAt: '2025-08-01T10:00:00Z', updatedAt: '2026-03-15T09:00:00Z' },
  { id: 'usr-04', tenantId: null, branchId: null, branchName: null, role: UserRole.OP, name: 'Fernanda Operadora', email: 'fernanda@properfy.com', phone: null, status: UserStatus.INACTIVE, lastLoginAt: '2026-01-20T10:00:00Z', createdAt: '2025-08-15T10:00:00Z', updatedAt: '2026-02-01T10:00:00Z' },
  { id: 'usr-05', tenantId: 't-1', branchId: 'b-1', branchName: 'Filial Centro', role: UserRole.CL_ADMIN, name: 'Ana Gestora', email: 'ana@imobiliaria.com', phone: '11988000001', status: UserStatus.ACTIVE, lastLoginAt: '2026-03-15T07:30:00Z', createdAt: '2025-09-01T10:00:00Z', updatedAt: '2026-03-15T07:30:00Z' },
  { id: 'usr-06', tenantId: 't-1', branchId: 'b-2', branchName: 'Filial Zona Sul', role: UserRole.CL_ADMIN, name: 'Roberto Admin', email: 'roberto@imobiliaria.com', phone: '11988000002', status: UserStatus.ACTIVE, lastLoginAt: '2026-03-14T16:00:00Z', createdAt: '2025-09-15T10:00:00Z', updatedAt: '2026-03-14T16:00:00Z' },
  { id: 'usr-07', tenantId: 't-2', branchId: 'b-3', branchName: 'Matriz', role: UserRole.CL_ADMIN, name: 'Juliana Diretora', email: 'juliana@realty.com', phone: '11988000003', status: UserStatus.LOCKED, lastLoginAt: '2026-02-10T10:00:00Z', createdAt: '2025-10-01T10:00:00Z', updatedAt: '2026-02-15T10:00:00Z' },
  { id: 'usr-08', tenantId: 't-1', branchId: 'b-1', branchName: 'Filial Centro', role: UserRole.CL_USER, name: 'Marcos Atendente', email: 'marcos@imobiliaria.com', phone: '11977000001', status: UserStatus.ACTIVE, lastLoginAt: '2026-03-15T10:00:00Z', createdAt: '2025-10-15T10:00:00Z', updatedAt: '2026-03-15T10:00:00Z' },
  { id: 'usr-09', tenantId: 't-1', branchId: 'b-2', branchName: 'Filial Zona Sul', role: UserRole.CL_USER, name: 'Priscila Auxiliar', email: 'priscila@imobiliaria.com', phone: null, status: UserStatus.INACTIVE, lastLoginAt: null, createdAt: '2025-11-01T10:00:00Z', updatedAt: '2026-01-10T10:00:00Z' },
  { id: 'usr-10', tenantId: 't-2', branchId: 'b-3', branchName: 'Matriz', role: UserRole.CL_USER, name: 'Thiago Corretor', email: 'thiago@realty.com', phone: '11977000003', status: UserStatus.ACTIVE, lastLoginAt: '2026-03-13T14:00:00Z', createdAt: '2025-11-15T10:00:00Z', updatedAt: '2026-03-13T14:00:00Z' },
  { id: 'usr-11', tenantId: null, branchId: null, branchName: null, role: UserRole.INSP, name: 'Diego Inspetor', email: 'diego@inspecoes.com', phone: '11966000001', status: UserStatus.ACTIVE, lastLoginAt: '2026-03-15T06:00:00Z', createdAt: '2025-12-01T10:00:00Z', updatedAt: '2026-03-15T06:00:00Z' },
  { id: 'usr-12', tenantId: null, branchId: null, branchName: null, role: UserRole.INSP, name: 'Camila Inspetora', email: 'camila@inspecoes.com', phone: '11966000002', status: UserStatus.ACTIVE, lastLoginAt: '2026-03-14T07:00:00Z', createdAt: '2025-12-15T10:00:00Z', updatedAt: '2026-03-14T07:00:00Z' },
  { id: 'usr-13', tenantId: null, branchId: null, branchName: null, role: UserRole.INSP, name: 'Rafael Inspetor', email: 'rafael@inspecoes.com', phone: null, status: UserStatus.INACTIVE, lastLoginAt: '2026-01-05T10:00:00Z', createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-02-01T10:00:00Z' },
  { id: 'usr-14', tenantId: 't-1', branchId: null, branchName: null, role: UserRole.TNT, name: 'Lucas Inquilino', email: 'lucas@email.com', phone: '11955000001', status: UserStatus.ACTIVE, lastLoginAt: null, createdAt: '2026-02-01T10:00:00Z', updatedAt: '2026-02-01T10:00:00Z' },
  { id: 'usr-15', tenantId: 't-2', branchId: null, branchName: null, role: UserRole.TNT, name: 'Beatriz Inquilina', email: 'beatriz@email.com', phone: '11955000002', status: UserStatus.LOCKED, lastLoginAt: null, createdAt: '2026-02-15T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z' },
];

function filterUsers(
  data: User[],
  filters: UserFiltersState,
): User[] {
  return data.filter((user) => {
    if (filters.role && user.role !== filters.role) return false;
    if (filters.status && user.status !== filters.status) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.phone?.toLowerCase().includes(term) ?? false);
      if (!matches) return false;
    }

    return true;
  });
}

function sortUsers(
  data: User[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): User[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseUserListReturn {
  data: User[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: UserFiltersState;
  setFilters: (filters: UserFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useUserList(): UseUserListReturn {
  const [filters, setFilters] = useState<UserFiltersState>(DEFAULT_FILTERS);
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
    () => filterUsers(MOCK_USERS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortUsers(filtered, sortBy, sortOrder),
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
