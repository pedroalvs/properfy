import { useState } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { UserFilters } from '../components/UserFilters';
import { UserTable } from '../components/UserTable';
import { UserDetailDrawer } from '../components/UserDetailDrawer';
import { UserFormDrawer } from '../components/UserFormDrawer';
import { useUserList } from '../hooks/useUserList';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { SelectInput } from '@/components/forms/SelectInput';
import { FormField } from '@/components/forms/FormField';

export function UserListPage() {
  const { user: authUser } = useAuth();
  const isGlobalRole = authUser?.role === 'AM' || authUser?.role === 'OP';
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const requiresTenantSelection = isGlobalRole && !selectedTenantId;

  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'form-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole },
  );

  const effectiveTenantId = isGlobalRole ? selectedTenantId : undefined;

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
  } = useUserList(effectiveTenantId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <>
      <ListFilterTableTemplate
        title="Users"
        primaryAction={{
          label: 'New User',
          icon: 'mdi-plus',
          onClick: () => {
            setEditId(null);
            setFormOpen(true);
          },
          disabled: requiresTenantSelection,
        }}
      >
        {isGlobalRole && (
          <div className="px-0 pb-2">
            <FormField label="Agency">
              <SelectInput
                value={selectedTenantId}
                onChange={setSelectedTenantId}
                options={tenantOptions}
                placeholder="Select agency to view users"
                aria-label="Agency"
              />
            </FormField>
            {requiresTenantSelection && (
              <p className="mt-2 text-sm text-text-muted">
                Select an agency before creating or editing users.
              </p>
            )}
          </div>
        )}
        <UserFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <UserTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load users') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
          onView={(user) => {
            setSelectedId(user.id);
            setDrawerOpen(true);
          }}
          onEdit={(user) => {
            setSelectedId(user.id);
            setDrawerOpen(true);
          }}
        />
      </ListFilterTableTemplate>
      <UserDetailDrawer
        userId={selectedId}
        open={drawerOpen}
        tenantId={effectiveTenantId}
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
      <UserFormDrawer
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditId(null); }}
        userId={editId}
        tenantId={effectiveTenantId}
        onSaved={() => { setFormOpen(false); setEditId(null); refetch(); }}
      />
    </>
  );
}
