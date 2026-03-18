import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { LoadingState } from '@/components/feedback/LoadingState';
import { formatDate } from '@/lib/format-date';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DetailRow } from '@/components/data/DetailRow';
import { FormSection } from '@/components/forms/FormSection';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TenantStatusChip } from '../components/TenantStatusChip';
import { BranchSection } from '../components/BranchSection';
import { TenantFormDrawer } from '../components/TenantFormDrawer';
import { useTenantAdminDetail } from '../hooks/useTenantAdminDetail';
import { useTenantDeactivate } from '../hooks/useTenantDeactivate';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'branches', label: 'Branches' },
];

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenant, isLoading, isError, refetch } = useTenantAdminDetail(id ?? null);

  const [activeTab, setActiveTab] = useState('overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  const { deactivate, isDeactivating } = useTenantDeactivate(
    id ?? null,
    () => {
      setShowDeactivateConfirm(false);
      refetch();
    },
  );

  const handleEdit = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const handleSaved = useCallback(() => {
    setDrawerOpen(false);
    refetch();
  }, [refetch]);

  const handleBack = useCallback(() => {
    navigate('/tenants');
  }, [navigate]);

  const handleDeactivateClick = useCallback(() => {
    setShowDeactivateConfirm(true);
  }, []);

  const handleConfirmDeactivate = useCallback(() => {
    deactivate();
  }, [deactivate]);

  const handleCancelDeactivate = useCallback(() => {
    setShowDeactivateConfirm(false);
  }, []);

  if (isLoading) {
    return (
      <div className="px-8 py-6">
        <LoadingState rows={8} />
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className="px-8 py-6">
        <EmptyState
          title="Agency not found"
          description="The agency you are looking for does not exist or you do not have access."
          action={{ label: 'Back to Agencies', onClick: handleBack }}
        />
      </div>
    );
  }

  const secondaryActions = tenant.status === 'ACTIVE'
    ? [{ label: 'Deactivate', icon: 'mdi-close-circle-outline', onClick: handleDeactivateClick }]
    : [];

  return (
    <div className="px-8 py-6">
      <PageHeader
        title={tenant.name}
        primaryAction={{ label: 'Edit', icon: 'mdi-pencil-outline', onClick: handleEdit }}
        secondaryActions={secondaryActions}
      />

      <div className="mb-4 flex items-center gap-3">
        <TenantStatusChip status={tenant.status} />
        {tenant.legalName && (
          <span className="text-sm text-text-secondary">{tenant.legalName}</span>
        )}
      </div>

      <TabsNav tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="rounded bg-card-bg p-6 shadow-sm">
            <FormSection title="Agency Details">
              <DetailRow label="Name" value={tenant.name} />
              <DetailRow label="Legal Name" value={tenant.legalName} />
              <DetailRow label="Status" value={<TenantStatusChip status={tenant.status} />} />
              <DetailRow label="Timezone" value={tenant.timezone} />
              <DetailRow label="Currency" value={tenant.currency} />
              <DetailRow label="Branches" value={tenant.branchCount} />
              <DetailRow label="Notes" value={tenant.notes} />
              <DetailRow
                label="Created"
                value={formatDate(tenant.createdAt)}
              />
              <DetailRow
                label="Updated"
                value={formatDate(tenant.updatedAt)}
              />
            </FormSection>
          </div>
        )}

        {activeTab === 'branches' && id && (
          <BranchSection tenantId={id} />
        )}
      </div>

      <TenantFormDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        tenantId={id}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={showDeactivateConfirm}
        title="Deactivate Agency"
        message={`Are you sure you want to deactivate "${tenant.name}"? This will affect all associated branches and appointments.`}
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        variant="danger"
        loading={isDeactivating}
        onConfirm={handleConfirmDeactivate}
        onClose={handleCancelDeactivate}
      />
    </div>
  );
}
