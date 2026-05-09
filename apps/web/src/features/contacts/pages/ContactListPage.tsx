import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { FilterRequiredState } from '@/components/feedback/FilterRequiredState';
import { ContactFilters } from '../components/ContactFilters';
import { ContactTable } from '../components/ContactTable';
import { ContactDetailDrawer } from '../components/ContactDetailDrawer';
import { ContactFormDrawer } from '../components/ContactFormDrawer';
import { DeactivateContactModal } from '../components/DeactivateContactModal';
import { useContactList } from '../hooks/useContactList';
import { useContactDeactivate } from '../hooks/useContactDeactivate';
import type { ContactListItem } from '../types';

export function ContactListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canPerform, hasRole } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  // Constitution v1.3.0 (op_role_rollback): AM and OP are both cross-tenant
  // operational roles. Both pick an agency; CL_* use the JWT tenant directly.
  const isCrossTenantRole = hasRole('AM', 'OP');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const effectiveTenantId = isCrossTenantRole ? selectedTenantId : undefined;
  const requiresTenantSelection = isCrossTenantRole && !selectedTenantId;
  const canCreate = canPerform('contact.create');
  const canEdit = canPerform('contact.update');
  const canDeactivate = canPerform('contact.deactivate');
  const canMutate = canCreate || canEdit || canDeactivate;

  const { data: tenantsResp } = usePaginatedQuery<{ id: string; name: string }>(
    ['tenants', 'contact-list'],
    '/v1/tenants',
    { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' },
    { enabled: isCrossTenantRole },
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
  } = useContactList(effectiveTenantId);

  const tenantOptions = useMemo(
    () => (tenantsResp?.data ?? []).map((tenant) => ({ value: tenant.id, label: tenant.name })),
    [tenantsResp],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ContactListItem | null>(null);

  const { deactivate, reactivate, isPending: isDeactivating } = useContactDeactivate();

  const handleView = useCallback((row: ContactListItem) => {
    setSelectedId(row.id);
    setDrawerOpen(true);
  }, []);

  const handleEdit = useCallback((row: ContactListItem) => {
    setEditId(row.id);
    setFormOpen(true);
  }, []);

  const handleDeactivate = useCallback((row: ContactListItem) => {
    setDeactivateTarget(row);
  }, []);

  const handleReactivate = useCallback(async (row: ContactListItem) => {
    const result = await reactivate(row.id);
    if (result.success) {
      showSuccess('Contact reactivated');
      refetch();
    } else {
      showError(result.errorMessage ?? 'Failed to reactivate contact');
    }
  }, [reactivate, refetch, showSuccess, showError]);

  const confirmDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;
    const result = await deactivate(deactivateTarget.id);
    if (result.success) {
      showSuccess('Contact deactivated');
      setDeactivateTarget(null);
      refetch();
    } else {
      showError(result.errorMessage ?? 'Failed to deactivate contact');
    }
  }, [deactivate, deactivateTarget, refetch, showSuccess, showError]);

  return (
    <>
      <ListFilterTableTemplate
        title="Contacts"
        primaryAction={canCreate ? {
          label: 'New Contact',
          icon: 'mdi-plus',
          onClick: () => setFormOpen(true),
          disabled: requiresTenantSelection,
        } : undefined}
      >
        {isCrossTenantRole && (
          <div className="px-0 pb-2">
            <FormField label="Agency">
              <SelectInput
                value={selectedTenantId}
                onChange={setSelectedTenantId}
                options={tenantOptions}
                placeholder="Select agency to view contacts"
                aria-label="Agency"
              />
            </FormField>
          </div>
        )}
        {requiresTenantSelection ? (
          <FilterRequiredState message="Select an agency to view contacts." />
        ) : (
          <>
            <ContactFilters
              filters={filters}
              onFiltersChange={setFilters}
              tenantId={effectiveTenantId ?? user?.tenantId ?? null}
            />
            <ContactTable
              data={data}
              loading={isLoading}
              error={isError ? (errorMessage ?? 'Failed to load contacts') : undefined}
              onRetryError={refetch}
              pagination={pagination}
              canMutate={canMutate}
              onView={handleView}
              onEdit={canEdit ? handleEdit : undefined}
              onDeactivate={canDeactivate ? handleDeactivate : undefined}
              onReactivate={canDeactivate ? handleReactivate : undefined}
            />
          </>
        )}
      </ListFilterTableTemplate>
      <ContactDetailDrawer
        contactId={selectedId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedId(null);
        }}
        canEdit={canEdit}
        canDeactivate={canDeactivate}
        onEdit={(id) => {
          setDrawerOpen(false);
          setSelectedId(null);
          setEditId(id);
          setFormOpen(true);
        }}
        onDeactivate={(id) => {
          const target = data.find((c) => c.id === id) ?? null;
          if (target) {
            setDrawerOpen(false);
            setDeactivateTarget(target);
          }
        }}
        onReactivate={async (id) => {
          const target = data.find((c) => c.id === id);
          if (target) await handleReactivate(target);
          setDrawerOpen(false);
        }}
      />
      <ContactFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        contactId={editId}
        tenantIdOverride={effectiveTenantId}
        onSaved={() => {
          setFormOpen(false);
          setEditId(null);
          refetch();
        }}
        onCreated={(id) => navigate(`/contacts/${id}`)}
      />
      <DeactivateContactModal
        open={!!deactivateTarget}
        contactName={deactivateTarget?.displayName ?? null}
        loading={isDeactivating}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivate}
      />
    </>
  );
}
