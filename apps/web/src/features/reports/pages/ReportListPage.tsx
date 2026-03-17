import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ReportFilters } from '../components/ReportFilters';
import { ReportTable } from '../components/ReportTable';
import { ReportDetailDrawer } from '../components/ReportDetailDrawer';
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleView = useCallback((report: { id: string }) => {
    setSelectedId(report.id);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
  }, []);

  return (
    <ListFilterTableTemplate
      title="Reports"
      primaryAction={{ label: 'Generate Report', icon: 'mdi-plus', onClick: () => {} }}
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={setFilters}
      />
      <ReportTable
        data={data}
        loading={isLoading}
        error={isError ? (errorMessage ?? 'Failed to load reports') : undefined}
        onRetryError={refetch}
        pagination={pagination}
        sorting={sorting}
        onDownload={() => {}}
        onRetry={() => {}}
        onView={handleView}
      />
      <ReportDetailDrawer
        reportId={selectedId}
        open={drawerOpen}
        onClose={handleCloseDrawer}
      />
    </ListFilterTableTemplate>
  );
}
