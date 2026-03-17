import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ReportFilters } from '../components/ReportFilters';
import { ReportTable } from '../components/ReportTable';
import { ReportDetailDrawer } from '../components/ReportDetailDrawer';
import { useReportList } from '../hooks/useReportList';
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import type { Report } from '../types';

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

  const { showSuccess, showError } = useSnackbar();
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

  const handleGenerate = useCallback(async () => {
    try {
      const { error } = await api.POST('/v1/reports' as any, {
        body: {} as any,
      });
      if (error) {
        throw new Error((error as any)?.error?.message ?? 'Failed to generate report');
      }
      showSuccess('Report generation started');
      refetch();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to generate report');
    }
  }, [refetch, showSuccess, showError]);

  const handleDownload = useCallback(async (report: Report) => {
    try {
      const { data: fileData, error } = await api.GET(
        `/v1/reports/${report.id}/download` as any,
        {},
      );
      if (error) {
        throw new Error((error as any)?.error?.message ?? 'Failed to download report');
      }

      if (fileData instanceof Blob) {
        const url = URL.createObjectURL(fileData);
        const a = document.createElement('a');
        a.href = url;
        a.download = report.fileName ?? `report-${report.id}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to download report');
    }
  }, [showError]);

  const handleRetry = useCallback(async (report: Report) => {
    try {
      const { error } = await api.POST(
        `/v1/reports/${report.id}/retry` as any,
        {},
      );
      if (error) {
        throw new Error((error as any)?.error?.message ?? 'Failed to retry report');
      }
      showSuccess('Report regeneration started');
      refetch();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to retry report');
    }
  }, [refetch, showSuccess, showError]);

  return (
    <ListFilterTableTemplate
      title="Reports"
      primaryAction={{ label: 'Generate Report', icon: 'mdi-plus', onClick: handleGenerate }}
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
        onDownload={handleDownload}
        onRetry={handleRetry}
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
