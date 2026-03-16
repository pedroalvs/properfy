import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { FinancialFilters } from '../components/FinancialFilters';
import { FinancialTable } from '../components/FinancialTable';
import { useFinancialList } from '../hooks/useFinancialList';

export function FinancialListPage() {
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
  } = useFinancialList();

  return (
    <ListFilterTableTemplate
      title="Financeiro"
      primaryAction={{ label: 'Nova Entrada', icon: 'mdi-plus', onClick: () => {} }}
    >
      <FinancialFilters
        filters={filters}
        onFiltersChange={setFilters}
      />
      <FinancialTable
        data={data}
        loading={isLoading}
        error={isError ? (errorMessage ?? 'Erro ao carregar entradas financeiras') : undefined}
        onRetryError={refetch}
        pagination={pagination}
        sorting={sorting}
        onView={() => {}}
        onEdit={() => {}}
      />
    </ListFilterTableTemplate>
  );
}
