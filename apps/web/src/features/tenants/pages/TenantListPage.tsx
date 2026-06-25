import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { usePermissions } from '@/hooks/usePermissions';
import { TenantAdminFilters } from '../components/TenantAdminFilters';
import { TenantAdminTable } from '../components/TenantAdminTable';
import { TenantFormDrawer } from '../components/TenantFormDrawer';
import { useTenantAdminList } from '../hooks/useTenantAdminList';
import { useState } from 'react';
import type { TenantAdmin } from '../types';

export function TenantListPage() {
  const navigate = useNavigate();
  const { canPerform } = usePermissions();

  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = useTenantAdminList();

  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleView = useCallback((tenant: TenantAdmin) => {
    navigate(`/tenants/${tenant.id}`);
  }, [navigate]);

  const handleCreate = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const handleSaved = useCallback(() => {
    setDrawerOpen(false);
    refetch();
  }, [refetch]);

  return (
    <>
      <ListFilterTableTemplate
        title="Agencies"
        primaryAction={
          canPerform('tenant.create')
            ? { label: 'New Agency', icon: 'mdi-plus', onClick: handleCreate }
            : undefined
        }
      >
        <TenantAdminFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <TenantAdminTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load agencies') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          onView={handleView}
        />
      </ListFilterTableTemplate>

      <TenantFormDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        onSaved={handleSaved}
      />
    </>
  );
}
