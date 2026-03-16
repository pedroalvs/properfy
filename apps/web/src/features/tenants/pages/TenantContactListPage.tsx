import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { TenantFilters } from '../components/TenantFilters';
import { TenantTable } from '../components/TenantTable';
import { useTenantContactList } from '../hooks/useTenantContactList';

export function TenantContactListPage() {
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
  } = useTenantContactList();

  return (
    <ListFilterTableTemplate title="Inquilinos">
      <TenantFilters
        filters={filters}
        onFiltersChange={setFilters}
      />
      <TenantTable
        data={data}
        loading={isLoading}
        error={isError ? (errorMessage ?? 'Erro ao carregar inquilinos') : undefined}
        onRetryError={refetch}
        pagination={pagination}
        sorting={sorting}
        onView={() => {}}
      />
    </ListFilterTableTemplate>
  );
}
