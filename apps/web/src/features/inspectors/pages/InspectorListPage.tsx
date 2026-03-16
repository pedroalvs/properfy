import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { InspectorFilters } from '../components/InspectorFilters';
import { InspectorTable } from '../components/InspectorTable';
import { useInspectorList } from '../hooks/useInspectorList';

export function InspectorListPage() {
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
  } = useInspectorList();

  return (
    <ListFilterTableTemplate
      title="Inspetores"
      primaryAction={{ label: 'Novo Inspetor', icon: 'mdi-plus', onClick: () => {} }}
    >
      <InspectorFilters
        filters={filters}
        onFiltersChange={setFilters}
      />
      <InspectorTable
        data={data}
        loading={isLoading}
        error={isError ? (errorMessage ?? 'Erro ao carregar inspetores') : undefined}
        onRetryError={refetch}
        pagination={pagination}
        sorting={sorting}
        onView={() => {}}
        onEdit={() => {}}
      />
    </ListFilterTableTemplate>
  );
}
