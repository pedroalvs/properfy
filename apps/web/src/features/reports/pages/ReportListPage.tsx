import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ReportFilters } from '../components/ReportFilters';
import { ReportTable } from '../components/ReportTable';
import { useReportList } from '../hooks/useReportList';

export function ReportListPage() {
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
  } = useReportList();

  return (
    <ListFilterTableTemplate
      title="Relatórios"
      primaryAction={{ label: 'Gerar Relatório', icon: 'mdi-plus', onClick: () => {} }}
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={setFilters}
      />
      <ReportTable
        data={data}
        loading={isLoading}
        error={isError ? (errorMessage ?? 'Erro ao carregar relatórios') : undefined}
        onRetryError={refetch}
        pagination={pagination}
        sorting={sorting}
        onDownload={() => {}}
        onRetry={() => {}}
        onView={() => {}}
      />
    </ListFilterTableTemplate>
  );
}
