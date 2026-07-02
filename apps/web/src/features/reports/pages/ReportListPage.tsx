import { useState, useCallback } from 'react';
import type { RequestReportInput } from '@properfy/shared';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ReportFilters } from '../components/ReportFilters';
import { ReportTable } from '../components/ReportTable';
import { ReportDetailDrawer } from '../components/ReportDetailDrawer';
import { GenerateReportDialog } from '../components/GenerateReportDialog';
import { useReportList } from '../hooks/useReportList';
import { useReportGenerate } from '../hooks/useReportGenerate';
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import type { paths } from '@properfy/shared';
import { unwrapSuccessData } from '@/lib/api-envelope';
import type { Report } from '../types';
import { getReportDownloadName } from '../lib/report-display';

type ReportDownloadResponse =
  paths['/v1/reports/{reportId}/download']['get']['responses'][200]['content']['application/json'];

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
  } = useReportList();

  const { showError } = useSnackbar();
  const { generate, isGenerating } = useReportGenerate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  const handleView = useCallback((report: { id: string }) => {
    setSelectedId(report.id);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
  }, []);

  const handleGenerateSubmit = useCallback((input: RequestReportInput) => {
    generate(input, {
      onSuccess: () => {
        setGenerateOpen(false);
        refetch();
      },
    });
  }, [generate, refetch]);

  const handleDownload = useCallback(async (report: Report) => {
    try {
      const { data: fileData, error } = await api.GET(
        '/v1/reports/{reportId}/download',
        { params: { path: { reportId: report.id } } },
      );
      if (error) {
        throw new Error((error as any)?.error?.message ?? 'Failed to download report');
      }

      const downloadUrl = unwrapSuccessData<ReportDownloadResponse['data']>(fileData)?.downloadUrl;
      if (!downloadUrl) {
        throw new Error('Report download URL is unavailable');
      }

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = getReportDownloadName(report);
      a.target = '_blank';
      a.rel = 'noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to download report');
    }
  }, [showError]);

  const handleRetry = useCallback((report: Report) => {
    if (!report.filters) {
      showError('This report cannot be regenerated because its filters are unavailable');
      return;
    }

    generate(
      { reportType: report.reportType, filters: report.filters },
      { onSuccess: () => refetch() },
    );
  }, [generate, refetch, showError]);

  return (
    <ListFilterTableTemplate
      title="Reports"
      primaryAction={{ label: 'Generate Report', icon: 'mdi-plus', onClick: () => setGenerateOpen(true) }}
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
        onDownload={handleDownload}
        onRetry={handleRetry}
        onView={handleView}
      />
      <ReportDetailDrawer
        reportId={selectedId}
        open={drawerOpen}
        onClose={handleCloseDrawer}
      />
      <GenerateReportDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onSubmit={handleGenerateSubmit}
        isSubmitting={isGenerating}
      />
    </ListFilterTableTemplate>
  );
}
