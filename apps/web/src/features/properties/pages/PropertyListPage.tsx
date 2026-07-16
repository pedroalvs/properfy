import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { usePermissions } from '@/hooks/usePermissions';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { PropertyFilters } from '../components/PropertyFilters';
import { PropertyTable } from '../components/PropertyTable';
import { PropertyDetailDrawer } from '../components/PropertyDetailDrawer';
import { PropertyFormDrawer } from '../components/PropertyFormDrawer';
import { usePropertyList } from '../hooks/usePropertyList';
import { usePropertySummary } from '../hooks/usePropertySummary';
import { PropertySummaryIndicators } from '../components/PropertySummaryIndicators';

export function PropertyListPage() {
  const navigate = useNavigate();
  const { canPerform, hasRole } = usePermissions();
  const isGlobalRole = hasRole('AM', 'OP');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const effectiveTenantId = isGlobalRole ? selectedTenantId : undefined;
  const canCreate = canPerform('property.create');
  const { data: tenantsResp } = usePaginatedQuery<{ id: string; name: string }>(
    ['tenants', 'property-list'],
    '/v1/tenants',
    { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' },
    { enabled: isGlobalRole },
  );
  const { data: branchesResp } = usePaginatedQuery<{ id: string; name: string }>(
    ['branches', 'property-list', effectiveTenantId ?? 'self'],
    '/v1/branches',
    { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc', tenantId: effectiveTenantId },
    { enabled: !isGlobalRole || !!effectiveTenantId },
  );
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = usePropertyList(effectiveTenantId);

  // Summary follows the page filters except the type filter — per-type counts
  // must stay stable when the list is narrowed to a single type.
  const summaryQuery = usePropertySummary({
    tenantId: effectiveTenantId || undefined,
    branchId: filters.branchId || undefined,
    search: filters.search || undefined,
  });
  const agencyOptions = useMemo(
    () => [
      { label: 'All agencies', value: '' },
      ...(tenantsResp?.data ?? []).map((tenant) => ({ value: tenant.id, label: tenant.name })),
    ],
    [tenantsResp],
  );
  const branchOptions = useMemo(
    () => [
      { label: 'All', value: '' },
      ...(branchesResp?.data ?? []).map((branch) => ({ label: branch.name, value: branch.id })),
    ],
    [branchesResp],
  );

  const handleAgencyChange = (agencyId: string) => {
    setSelectedTenantId(agencyId);
    setFilters({ ...filters, branchId: '' });
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <>
      <ListFilterTableTemplate
        title="Properties"
        primaryAction={canCreate ? {
          label: 'New Property',
          icon: 'mdi-plus',
          onClick: () => navigate('/properties/new', { state: effectiveTenantId ? { tenantId: effectiveTenantId } : undefined }),
        } : undefined}
      >
        <PropertySummaryIndicators
          summary={summaryQuery.summary}
          isLoading={summaryQuery.isLoading}
          isError={summaryQuery.isError}
        />
        <PropertyFilters
          filters={filters}
          onFiltersChange={setFilters}
          branchOptions={branchOptions}
          agencyOptions={isGlobalRole ? agencyOptions : undefined}
          agencyValue={selectedTenantId}
          onAgencyChange={isGlobalRole ? handleAgencyChange : undefined}
        />
        <PropertyTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load properties') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          showAgency={isGlobalRole}
          onView={(prop) => {
            navigate(`/properties/${prop.id}`);
          }}
        />
      </ListFilterTableTemplate>
      <PropertyDetailDrawer
        propertyId={selectedId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedId(null);
        }}
        onEdit={(id) => {
          setDrawerOpen(false);
          setSelectedId(null);
          setEditId(id);
          setFormOpen(true);
        }}
      />
      <PropertyFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        propertyId={editId}
        onSaved={() => {
          setFormOpen(false);
          refetch();
        }}
      />
    </>
  );
}
