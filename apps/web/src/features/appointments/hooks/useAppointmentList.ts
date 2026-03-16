import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Appointment, type AppointmentFiltersState } from '../types';

const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt-01', code: 'VST-001', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro',
    propertyId: 'prop-1', propertyAddress: 'Rua das Flores, 123', serviceTypeId: 'svc-1', serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.DRAFT, tenantConfirmationStatus: TenantConfirmationStatus.PENDING,
    contactName: 'João Silva', contactPhone: '11999999999', contactEmail: 'joao@email.com',
    inspectorId: null, inspectorName: null, scheduledDate: '2026-03-25T12:00:00Z', timeSlot: '09:00-12:00',
    keyRequired: false, notes: null, createdAt: '2026-03-10T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z',
  },
  {
    id: 'apt-02', code: 'VST-002', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro',
    propertyId: 'prop-2', propertyAddress: 'Av. Paulista, 1000', serviceTypeId: 'svc-1', serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.AWAITING_INSPECTOR, tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'Maria Santos', contactPhone: '11988888888', contactEmail: 'maria@email.com',
    inspectorId: null, inspectorName: null, scheduledDate: '2026-03-22T12:00:00Z', timeSlot: '14:00-17:00',
    keyRequired: true, notes: 'Portaria 24h', createdAt: '2026-03-09T10:00:00Z', updatedAt: '2026-03-09T10:00:00Z',
  },
  {
    id: 'apt-03', code: 'VST-003', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte',
    propertyId: 'prop-3', propertyAddress: 'Rua Augusta, 500', serviceTypeId: 'svc-2', serviceTypeName: 'Vistoria de Saída',
    status: AppointmentStatus.SCHEDULED, tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'Pedro Oliveira', contactPhone: '11977777777', contactEmail: 'pedro@email.com',
    inspectorId: 'insp-1', inspectorName: 'Carlos Inspetor', scheduledDate: '2026-03-20T12:00:00Z', timeSlot: '09:00-12:00',
    keyRequired: false, notes: null, createdAt: '2026-03-08T10:00:00Z', updatedAt: '2026-03-08T10:00:00Z',
  },
  {
    id: 'apt-04', code: 'VST-004', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro',
    propertyId: 'prop-4', propertyAddress: 'Rua Oscar Freire, 200', serviceTypeId: 'svc-1', serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.DONE, tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'Ana Costa', contactPhone: '11966666666', contactEmail: 'ana@email.com',
    inspectorId: 'insp-2', inspectorName: 'Fernanda Inspetora', scheduledDate: '2026-03-15T12:00:00Z', timeSlot: '14:00-17:00',
    keyRequired: true, notes: 'Entrar pela garagem', createdAt: '2026-03-05T10:00:00Z', updatedAt: '2026-03-15T18:00:00Z',
  },
  {
    id: 'apt-05', code: 'VST-005', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte',
    propertyId: 'prop-5', propertyAddress: 'Alameda Santos, 800', serviceTypeId: 'svc-2', serviceTypeName: 'Vistoria de Saída',
    status: AppointmentStatus.CANCELLED, tenantConfirmationStatus: TenantConfirmationStatus.UNAVAILABLE,
    contactName: 'Lucas Mendes', contactPhone: '11955555555', contactEmail: 'lucas@email.com',
    inspectorId: null, inspectorName: null, scheduledDate: '2026-03-18T12:00:00Z', timeSlot: '09:00-12:00',
    keyRequired: false, notes: 'Inquilino cancelou', createdAt: '2026-03-04T10:00:00Z', updatedAt: '2026-03-12T10:00:00Z',
  },
  {
    id: 'apt-06', code: 'VST-006', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro',
    propertyId: 'prop-6', propertyAddress: 'Rua Haddock Lobo, 300', serviceTypeId: 'svc-1', serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.REJECTED, tenantConfirmationStatus: TenantConfirmationStatus.NO_RESPONSE,
    contactName: 'Fernanda Lima', contactPhone: '11944444444', contactEmail: 'fernanda@email.com',
    inspectorId: null, inspectorName: null, scheduledDate: '2026-03-17T12:00:00Z', timeSlot: '14:00-17:00',
    keyRequired: false, notes: 'Endereço incorreto', createdAt: '2026-03-03T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z',
  },
  {
    id: 'apt-07', code: 'VST-007', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte',
    propertyId: 'prop-7', propertyAddress: 'Rua Consolação, 150', serviceTypeId: 'svc-1', serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.SCHEDULED, tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'Roberto Alves', contactPhone: '11933333333', contactEmail: 'roberto@email.com',
    inspectorId: 'insp-1', inspectorName: 'Carlos Inspetor', scheduledDate: '2026-03-26T12:00:00Z', timeSlot: '09:00-12:00',
    keyRequired: true, notes: null, createdAt: '2026-03-11T10:00:00Z', updatedAt: '2026-03-11T10:00:00Z',
  },
  {
    id: 'apt-08', code: 'VST-008', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro',
    propertyId: 'prop-8', propertyAddress: 'Av. Brasil, 2000', serviceTypeId: 'svc-2', serviceTypeName: 'Vistoria de Saída',
    status: AppointmentStatus.DONE, tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'Carla Rodrigues', contactPhone: '11922222222', contactEmail: 'carla@email.com',
    inspectorId: 'insp-2', inspectorName: 'Fernanda Inspetora', scheduledDate: '2026-03-14T12:00:00Z', timeSlot: '14:00-17:00',
    keyRequired: false, notes: null, createdAt: '2026-03-02T10:00:00Z', updatedAt: '2026-03-14T18:00:00Z',
  },
  {
    id: 'apt-09', code: 'VST-009', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte',
    propertyId: 'prop-9', propertyAddress: 'Rua Bela Cintra, 450', serviceTypeId: 'svc-1', serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.AWAITING_INSPECTOR, tenantConfirmationStatus: TenantConfirmationStatus.PENDING,
    contactName: 'Thiago Ferreira', contactPhone: '11911111111', contactEmail: 'thiago@email.com',
    inspectorId: null, inspectorName: null, scheduledDate: '2026-03-28T12:00:00Z', timeSlot: '09:00-12:00',
    keyRequired: false, notes: null, createdAt: '2026-03-12T10:00:00Z', updatedAt: '2026-03-12T10:00:00Z',
  },
  {
    id: 'apt-10', code: 'VST-010', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro',
    propertyId: 'prop-10', propertyAddress: 'Rua Frei Caneca, 700', serviceTypeId: 'svc-2', serviceTypeName: 'Vistoria de Saída',
    status: AppointmentStatus.DRAFT, tenantConfirmationStatus: TenantConfirmationStatus.PENDING,
    contactName: 'Juliana Martins', contactPhone: '11900000000', contactEmail: 'juliana@email.com',
    inspectorId: null, inspectorName: null, scheduledDate: '2026-03-30T12:00:00Z', timeSlot: '14:00-17:00',
    keyRequired: true, notes: null, createdAt: '2026-03-13T10:00:00Z', updatedAt: '2026-03-13T10:00:00Z',
  },
  {
    id: 'apt-11', code: 'VST-011', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte',
    propertyId: 'prop-11', propertyAddress: 'Av. Rebouças, 1500', serviceTypeId: 'svc-1', serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.SCHEDULED, tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'Marcos Souza', contactPhone: '11898989898', contactEmail: 'marcos@email.com',
    inspectorId: 'insp-1', inspectorName: 'Carlos Inspetor', scheduledDate: '2026-03-21T12:00:00Z', timeSlot: '09:00-12:00',
    keyRequired: false, notes: null, createdAt: '2026-03-07T10:00:00Z', updatedAt: '2026-03-07T10:00:00Z',
  },
  {
    id: 'apt-12', code: 'VST-012', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro',
    propertyId: 'prop-12', propertyAddress: 'Rua Pamplona, 250', serviceTypeId: 'svc-1', serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.DONE, tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'Priscila Nunes', contactPhone: '11887878787', contactEmail: 'priscila@email.com',
    inspectorId: 'insp-2', inspectorName: 'Fernanda Inspetora', scheduledDate: '2026-03-12T12:00:00Z', timeSlot: '14:00-17:00',
    keyRequired: false, notes: null, createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-12T18:00:00Z',
  },
  {
    id: 'apt-13', code: 'VST-013', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte',
    propertyId: 'prop-13', propertyAddress: 'Rua Itapeva, 100', serviceTypeId: 'svc-2', serviceTypeName: 'Vistoria de Saída',
    status: AppointmentStatus.CANCELLED, tenantConfirmationStatus: TenantConfirmationStatus.UNAVAILABLE,
    contactName: 'Diego Nascimento', contactPhone: '11876767676', contactEmail: 'diego@email.com',
    inspectorId: null, inspectorName: null, scheduledDate: '2026-03-19T12:00:00Z', timeSlot: '09:00-12:00',
    keyRequired: false, notes: 'Reagendamento solicitado', createdAt: '2026-03-06T10:00:00Z', updatedAt: '2026-03-11T10:00:00Z',
  },
  {
    id: 'apt-14', code: 'VST-014', tenantId: 'tenant-1', branchId: 'branch-1', branchName: 'Filial Centro',
    propertyId: 'prop-14', propertyAddress: 'Av. Angélica, 1800', serviceTypeId: 'svc-1', serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.SCHEDULED, tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'Camila Barbosa', contactPhone: '11865656565', contactEmail: 'camila@email.com',
    inspectorId: 'insp-1', inspectorName: 'Carlos Inspetor', scheduledDate: '2026-03-27T12:00:00Z', timeSlot: '14:00-17:00',
    keyRequired: true, notes: null, createdAt: '2026-03-14T10:00:00Z', updatedAt: '2026-03-14T10:00:00Z',
  },
  {
    id: 'apt-15', code: 'VST-015', tenantId: 'tenant-1', branchId: 'branch-2', branchName: 'Filial Norte',
    propertyId: 'prop-15', propertyAddress: 'Rua da Consolação, 3000', serviceTypeId: 'svc-2', serviceTypeName: 'Vistoria de Saída',
    status: AppointmentStatus.AWAITING_INSPECTOR, tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'Rafael Moreira', contactPhone: '11854545454', contactEmail: 'rafael@email.com',
    inspectorId: null, inspectorName: null, scheduledDate: '2026-03-29T12:00:00Z', timeSlot: '09:00-12:00',
    keyRequired: false, notes: null, createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:00:00Z',
  },
];

function filterAppointments(
  data: Appointment[],
  filters: AppointmentFiltersState,
): Appointment[] {
  return data.filter((apt) => {
    if (!filters.showCancelled && apt.status === AppointmentStatus.CANCELLED) return false;

    if (filters.status && apt.status !== filters.status) return false;

    if (filters.branchId && apt.branchId !== filters.branchId) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        apt.code.toLowerCase().includes(term) ||
        apt.propertyAddress.toLowerCase().includes(term) ||
        apt.contactName.toLowerCase().includes(term);
      if (!matches) return false;
    }

    if (filters.startDate && apt.scheduledDate < filters.startDate) return false;
    if (filters.endDate && apt.scheduledDate > filters.endDate) return false;

    return true;
  });
}

function sortAppointments(
  data: Appointment[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): Appointment[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseAppointmentListReturn {
  data: Appointment[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: AppointmentFiltersState;
  setFilters: (filters: AppointmentFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useAppointmentList(): UseAppointmentListReturn {
  const [filters, setFilters] = useState<AppointmentFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('scheduledDate');
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
    () => filterAppointments(MOCK_APPOINTMENTS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortAppointments(filtered, sortBy, sortOrder),
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
