import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import type { FilterSelectOption } from '@/components/filters/FilterSelect';
import { AppointmentFilters } from '../components/AppointmentFilters';
import { AppointmentTable } from '../components/AppointmentTable';
import { useAppointmentList } from '../hooks/useAppointmentList';

const BRANCH_OPTIONS: FilterSelectOption[] = [
  { label: 'Todas', value: '' },
  { label: 'Filial Centro', value: 'branch-1' },
  { label: 'Filial Norte', value: 'branch-2' },
];

export function AppointmentListPage() {
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
    sorting,
  } = useAppointmentList();

  return (
    <ListFilterTableTemplate
      title="Vistorias"
      primaryAction={{ label: 'Nova Vistoria', icon: 'mdi-plus', onClick: () => {} }}
    >
      <AppointmentFilters
        filters={filters}
        onFiltersChange={setFilters}
        branchOptions={BRANCH_OPTIONS}
      />
      <AppointmentTable
        data={data}
        loading={isLoading}
        error={isError ? (errorMessage ?? 'Erro ao carregar vistorias') : undefined}
        onRetryError={refetch}
        pagination={pagination}
        sorting={sorting}
        onView={() => {}}
        onEdit={() => {}}
      />
    </ListFilterTableTemplate>
  );
}
