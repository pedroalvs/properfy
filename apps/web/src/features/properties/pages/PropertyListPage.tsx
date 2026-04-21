import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { PropertyFilters } from '../components/PropertyFilters';
import { PropertyTable } from '../components/PropertyTable';
import { PropertyDetailDrawer } from '../components/PropertyDetailDrawer';
import { PropertyFormDrawer } from '../components/PropertyFormDrawer';
import { FilterRequiredState } from '@/components/feedback/FilterRequiredState';
import { usePropertyList } from '../hooks/usePropertyList';

export function PropertyListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canPerform, hasRole } = usePermissions();
  const isGlobalRole = hasRole('AM', 'OP');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const effectiveTenantId = isGlobalRole ? selectedTenantId : undefined;
  const requiresTenantSelection = isGlobalRole && !selectedTenantId;
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

  const tenantOptions = useMemo(
    () => (tenantsResp?.data ?? []).map((tenant) => ({ value: tenant.id, label: tenant.name })),
    [tenantsResp],
  );
  const branchOptions = useMemo(
    () => [
      { label: 'All', value: '' },
      ...(branchesResp?.data ?? []).map((branch) => ({ label: branch.name, value: branch.id })),
    ],
    [branchesResp],
  );

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
          disabled: requiresTenantSelection,
        } : undefined}
        secondaryActions={[
          { label: 'Import', icon: 'mdi-upload', onClick: () => navigate('/properties/import') },
        ]}
      >
        {isGlobalRole && (
          <div className="px-0 pb-2">
            <FormField label="Agency">
              <SelectInput
                value={selectedTenantId}
                onChange={setSelectedTenantId}
                options={tenantOptions}
                placeholder="Select agency to view properties"
                aria-label="Agency"
              />
            </FormField>
          </div>
        )}
        {requiresTenantSelection ? (
          <FilterRequiredState message="Select an agency to view properties." />
        ) : (
          <>
            <PropertyFilters
              filters={filters}
              onFiltersChange={setFilters}
              branchOptions={branchOptions}
            />
            <PropertyTable
              data={data}
              loading={isLoading}
              error={isError ? (errorMessage ?? 'Failed to load properties') : undefined}
              onRetryError={refetch}
              pagination={pagination}
              onView={(prop) => {
                navigate(`/properties/${prop.id}`);
              }}
              onEdit={(prop) => {
                setSelectedId(prop.id);
                setDrawerOpen(true);
              }}
            />
          </>
        )}
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
