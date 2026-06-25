import { useCallback, useMemo, useState } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { usePermissions } from '@/hooks/usePermissions';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { AppFilters } from '../components/AppFilters';
import { AppTable } from '../components/AppTable';
import { AppFormDrawer } from '../components/AppFormDrawer';
import { DeactivateAppModal } from '../components/DeactivateAppModal';
import { useAppList } from '../hooks/useAppList';
import { useAppDeactivate } from '../hooks/useAppDeactivate';
import type { AppCredentialRow } from '../types';

/**
 * Apps registry — AM/OP-only manager of third-party app credentials per agency.
 * The agency selector is a scope filter (not a gate): the list shows every
 * agency's apps by default. Creating requires choosing an agency.
 */
export function AppListPage() {
  const { hasRole } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const canMutate = hasRole('AM', 'OP');

  const [selectedTenantId, setSelectedTenantId] = useState('');
  const effectiveTenantId = selectedTenantId || undefined;

  const { data: tenantsResp } = usePaginatedQuery<{ id: string; name: string }>(
    ['tenants', 'app-list'],
    '/v1/tenants',
    { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' },
  );
  const tenantOptions = useMemo(
    () => (tenantsResp?.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    [tenantsResp],
  );

  const { data, isLoading, isError, errorMessage, refetch, filters, setFilters, pagination } =
    useAppList(effectiveTenantId);

  const [formOpen, setFormOpen] = useState(false);
  const [editApp, setEditApp] = useState<AppCredentialRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AppCredentialRow | null>(null);
  const { deactivate, reactivate, isPending: isDeactivating } = useAppDeactivate();

  const handleEdit = useCallback((row: AppCredentialRow) => {
    setEditApp(row);
    setFormOpen(true);
  }, []);

  const handleReactivate = useCallback(async (row: AppCredentialRow) => {
    const result = await reactivate(row.id);
    if (result.success) {
      showSuccess('App reactivated');
      refetch();
    } else {
      showError(result.errorMessage ?? 'Failed to reactivate app');
    }
  }, [reactivate, refetch, showSuccess, showError]);

  const confirmDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;
    const result = await deactivate(deactivateTarget.id);
    if (result.success) {
      showSuccess('App deactivated');
      setDeactivateTarget(null);
      refetch();
    } else {
      showError(result.errorMessage ?? 'Failed to deactivate app');
    }
  }, [deactivate, deactivateTarget, refetch, showSuccess, showError]);

  return (
    <>
      <ListFilterTableTemplate
        title="Apps"
        primaryAction={canMutate ? {
          label: 'New App',
          icon: 'mdi-plus',
          onClick: () => { setEditApp(null); setFormOpen(true); },
        } : undefined}
      >
        <div className="px-0 pb-2">
          <FormField label="Agency">
            <SelectInput
              value={selectedTenantId}
              onChange={setSelectedTenantId}
              options={tenantOptions}
              placeholder="Filter by agency (optional)"
              aria-label="Agency"
            />
          </FormField>
        </div>
        <AppFilters filters={filters} onFiltersChange={setFilters} />
        <AppTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load apps') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          canMutate={canMutate}
          onEdit={canMutate ? handleEdit : undefined}
          onDeactivate={canMutate ? (row) => setDeactivateTarget(row) : undefined}
          onReactivate={canMutate ? handleReactivate : undefined}
        />
      </ListFilterTableTemplate>
      <AppFormDrawer
        open={formOpen}
        app={editApp}
        defaultTenantId={selectedTenantId || undefined}
        onClose={() => { setFormOpen(false); setEditApp(null); }}
        onSaved={() => { setFormOpen(false); setEditApp(null); refetch(); }}
      />
      <DeactivateAppModal
        open={!!deactivateTarget}
        appName={deactivateTarget?.name ?? null}
        loading={isDeactivating}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivate}
      />
    </>
  );
}
