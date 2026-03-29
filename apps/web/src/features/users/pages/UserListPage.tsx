import { useState } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { UserFilters } from '../components/UserFilters';
import { UserTable } from '../components/UserTable';
import { UserDetailDrawer } from '../components/UserDetailDrawer';
import { UserFormDrawer } from '../components/UserFormDrawer';
import { UserResetPasswordDialog } from '../components/UserResetPasswordDialog';
import { useUserList } from '../hooks/useUserList';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { SelectInput } from '@/components/forms/SelectInput';
import { FormField } from '@/components/forms/FormField';
import type { UserScope } from '../types';

export function UserListPage() {
  const { user: authUser } = useAuth();
  const isGlobalRole = authUser?.role === 'AM' || authUser?.role === 'OP';
  const [scope, setScope] = useState<UserScope>('tenant');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const requiresTenantSelection = isGlobalRole && scope === 'tenant' && !selectedTenantId;

  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'form-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole },
  );

  const effectiveTenantId = isGlobalRole && scope === 'tenant' ? selectedTenantId : undefined;

  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = useUserList(effectiveTenantId, isGlobalRole ? scope : 'tenant');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetUserName, setResetUserName] = useState<string | null>(null);
  const canResetPassword = authUser?.role === 'AM' || authUser?.role === 'OP';

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
            <FormField label="User Scope">
              <SelectInput
                value={scope}
                onChange={(value) => {
                  setScope(value as UserScope);
                  setSelectedTenantId('');
                }}
                options={[
                  { value: 'tenant', label: 'Agency Users' },
                  { value: 'internal', label: 'Internal Users' },
                ]}
                aria-label="User Scope"
              />
            </FormField>
            <FormField label="Agency">
              <SelectInput
                value={selectedTenantId}
                onChange={setSelectedTenantId}
                options={tenantOptions}
                placeholder="Select agency to view users"
                aria-label="Agency"
                disabled={scope !== 'tenant'}
              />
            </FormField>
            {requiresTenantSelection && (
              <p className="mt-2 text-sm text-text-muted">
                Select an agency before creating or editing users.
              </p>
            )}
            {scope === 'internal' && (
              <p className="mt-2 text-sm text-text-muted">
                Internal users are not linked to a specific agency.
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
        scope={isGlobalRole ? scope : 'tenant'}
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
        onResetPassword={canResetPassword && selectedId !== authUser?.id ? (id) => {
          const selectedUser = data.find((item) => item.id === id);
          setResetUserId(id);
          setResetUserName(selectedUser?.name ?? null);
          setResetPasswordOpen(true);
        } : undefined}
      />
      <UserFormDrawer
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditId(null); }}
        userId={editId}
        tenantId={effectiveTenantId}
        scope={isGlobalRole ? scope : 'tenant'}
        onSaved={() => { setFormOpen(false); setEditId(null); refetch(); }}
      />
      <UserResetPasswordDialog
        open={resetPasswordOpen}
        userId={resetUserId}
        userName={resetUserName}
        tenantId={effectiveTenantId}
        scope={isGlobalRole ? scope : 'tenant'}
        onClose={() => {
          setResetPasswordOpen(false);
          setResetUserId(null);
          setResetUserName(null);
        }}
        onReset={() => {
          refetch();
        }}
      />
    </>
  );
}
