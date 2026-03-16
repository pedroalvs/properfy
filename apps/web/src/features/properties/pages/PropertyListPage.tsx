import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import type { FilterSelectOption } from '@/components/filters/FilterSelect';
import { PropertyFilters } from '../components/PropertyFilters';
import { PropertyTable } from '../components/PropertyTable';
import { usePropertyList } from '../hooks/usePropertyList';

const BRANCH_OPTIONS: FilterSelectOption[] = [
  { label: 'Todas', value: '' },
  { label: 'Filial Centro', value: 'branch-1' },
  { label: 'Filial Norte', value: 'branch-2' },
];

export function PropertyListPage() {
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
  } = usePropertyList();

  return (
    <ListFilterTableTemplate
      title="Imóveis"
      primaryAction={{ label: 'Novo Imóvel', icon: 'mdi-plus', onClick: () => {} }}
    >
      <PropertyFilters
        filters={filters}
        onFiltersChange={setFilters}
        branchOptions={BRANCH_OPTIONS}
      />
      <PropertyTable
        data={data}
        loading={isLoading}
        error={isError ? (errorMessage ?? 'Erro ao carregar imóveis') : undefined}
        onRetryError={refetch}
        pagination={pagination}
        sorting={sorting}
        onView={() => {}}
        onEdit={() => {}}
      />
    </ListFilterTableTemplate>
  );
}
