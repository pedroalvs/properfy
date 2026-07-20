import { useState, useCallback, useEffect } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { TabsNav } from '@/components/layout/TabsNav';
import { useSnackbar } from '@/hooks/useSnackbar';
import { getErrorMessage } from '@/lib/api-error';
import { usePermissions } from '@/hooks/usePermissions';
import { NoPermissionState } from '@/components/feedback/NoPermissionState';
import { FinancialSummaryBar } from '../components/FinancialSummaryBar';
import { FinancialFilters } from '../components/FinancialFilters';
import { FinancialTable } from '../components/FinancialTable';
import { FinancialEntryDetailDrawer } from '../components/FinancialEntryDetailDrawer';
import { useFinancialList } from '../hooks/useFinancialList';
import { useAgencyFinancialExport } from '../hooks/useAgencyFinancialExport';

type AgencyTab = 'statement' | 'services';

const TABS = [
  { id: 'statement', label: 'Statement' },
  { id: 'services', label: 'Services rendered' },
];

/**
 * 031 — Read-only Agency financial surface (CL_ADMIN / flagged CL_USER; AM/OP allowed).
 * - Statement: the agency's own-tenant ledger (debits, refunds, adjustments).
 * - Services rendered: the same list pre-filtered to TENANT_DEBIT (each debit = a
 *   completed inspection).
 * - Reports: an XLSX export of the own-tenant statement.
 * No backoffice actions are rendered (no approve/adjust/refund/edit).
 */
export function AgencyFinancialPage() {
  const { hasClUserFlag } = usePermissions();
  const canView = hasClUserFlag('view_financials');
  const { showError } = useSnackbar();

  const [activeTab, setActiveTab] = useState<AgencyTab>('statement');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // CL roles are tenant-scoped server-side (from the JWT), so no tenantId is sent.
  const { data, isLoading, isError, errorMessage, refetch, filters, setFilters, pagination } =
    useFinancialList(undefined, canView);

  const { exportStatement, isExporting } = useAgencyFinancialExport();

  // The "Services rendered" tab is the statement pre-filtered to TENANT_DEBIT.
  useEffect(() => {
    if (activeTab === 'services') {
      setFilters({ entryType: 'TENANT_DEBIT', status: '' });
    } else {
      setFilters({ entryType: '', status: '' });
    }
    // setFilters is stable (useState setter); only react to tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleView = useCallback((entry: { id: string }) => {
    setSelectedId(entry.id);
    setDrawerOpen(true);
  }, []);

  const handleExport = useCallback(async () => {
    try {
      await exportStatement();
    } catch (err) {
      showError(getErrorMessage(err, 'Failed to export the financial statement.'));
    }
  }, [exportStatement, showError]);

  if (!canView) {
    return (
      <ListFilterTableTemplate title="Financial">
        <NoPermissionState message="You don't have permission to view financial information." />
      </ListFilterTableTemplate>
    );
  }

  return (
    <>
      <ListFilterTableTemplate
        title="Financial"
        primaryAction={{
          label: isExporting ? 'Exporting…' : 'Export',
          icon: 'mdi-file-excel-outline',
          onClick: handleExport,
          disabled: isExporting,
        }}
      >
        <TabsNav tabs={TABS} activeTab={activeTab} onChange={(id) => setActiveTab(id as AgencyTab)} />

        <div className="mt-3">
          <FinancialSummaryBar enabled={canView} />
        </div>

        {activeTab === 'statement' && (
          <FinancialFilters filters={filters} onFiltersChange={setFilters} />
        )}

        <div className="mt-2">
          <FinancialTable
            data={data}
            loading={isLoading}
            error={isError ? (errorMessage ?? 'Failed to load financial entries') : undefined}
            onRetryError={refetch}
            pagination={pagination}
            onView={handleView}
          />
        </div>
      </ListFilterTableTemplate>

      <FinancialEntryDetailDrawer
        entryId={selectedId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedId(null);
        }}
      />
    </>
  );
}
