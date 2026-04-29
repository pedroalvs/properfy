import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { AppointmentFilters } from '../components/AppointmentFilters';
import { AppointmentTable } from '../components/AppointmentTable';
import { AppointmentDetailDrawer } from '../components/AppointmentDetailDrawer';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { BulkEditModal } from '../components/BulkEditModal';
import { useAppointmentList } from '../hooks/useAppointmentList';

export function AppointmentListPage() {
  const navigate = useNavigate();
  const { canPerform, hasRole } = usePermissions();
  const { user } = useAuth();
  const isGlobalRole = hasRole('AM', 'OP');
  const tenantId = user?.tenantId ?? null;
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = useAppointmentList();

  // Service types are global (not tenant-scoped) — always fetched from the
  // canonical endpoint. Stable query key → cached, never refetched on filter change.
  const { options: serviceTypeApiOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'appointment-list-filter'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
  );
  const serviceTypeOptions = useMemo(
    () => [{ label: 'All', value: '' }, ...serviceTypeApiOptions],
    [serviceTypeApiOptions],
  );

  // Branches are tenant-scoped on the backend. CL roles get them from the API
  // pinned to their JWT tenantId (stable, cached). AM/OP have no tenant selector
  // on this screen → fall back to deriving from the loaded appointments so the
  // dropdown still shows something. Either way: stable query key → no refetch
  // when other filters change.
  const { options: branchApiOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'appointment-list-filter', tenantId ?? ''],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { ...(tenantId ? { tenantId } : {}), status: 'ACTIVE' },
    { enabled: !isGlobalRole && !!tenantId },
  );
  const branchOptions = useMemo(() => {
    if (!isGlobalRole) {
      return [{ label: 'All', value: '' }, ...branchApiOptions];
    }
    // AM/OP fallback: derive from the loaded appointments. Acknowledged
    // limitation — without a tenant filter on this screen we can't reliably
    // call /v1/branches cross-tenant. Tracked as follow-up.
    const seen = new Map<string, string>();
    for (const apt of data) seen.set(apt.branchId, apt.branchName);
    return [
      { label: 'All', value: '' },
      ...Array.from(seen.entries()).map(([value, label]) => ({ label, value })),
    ];
  }, [isGlobalRole, branchApiOptions, data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const canCreate = canPerform('appointment.create');
  const canMapImport = canPerform('property.import');
  const canBulkEdit = canPerform('appointment.cancel');
  const canViewMap = hasRole('AM', 'OP');

  return (
    <>
      <ListFilterTableTemplate
        title="Appointments"
        primaryAction={canCreate ? { label: 'New Appointment', icon: 'mdi-plus', onClick: () => { setEditId(null); setFormOpen(true); } } : undefined}
        secondaryActions={[
          ...(canMapImport ? [{ label: 'Import', icon: 'mdi-upload', onClick: () => navigate('/appointments/import') }] : []),
          ...(canViewMap ? [{ label: 'Map View', icon: 'mdi-map-outline', onClick: () => navigate('/appointments/map') }] : []),
        ]}
      >
        <AppointmentFilters
          filters={filters}
          onFiltersChange={setFilters}
          branchOptions={branchOptions}
          serviceTypeOptions={serviceTypeOptions}
        />
        <AppointmentTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load appointments') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          onView={(apt) => {
            setSelectedId(apt.id);
            setDrawerOpen(true);
          }}
          selectedIds={canBulkEdit ? selectedIds : undefined}
          onSelectionChange={canBulkEdit ? setSelectedIds : undefined}
        />
      </ListFilterTableTemplate>
      <AppointmentDetailDrawer
        appointmentId={selectedId}
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
      <AppointmentFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        appointmentId={editId}
        onSaved={() => {
          setFormOpen(false);
          setEditId(null);
          refetch();
        }}
      />
      {canBulkEdit && selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-[75px] right-0 z-40 flex items-center justify-between border-t border-border-subtle bg-card-bg px-6 py-3 shadow-lg">
          <span className="text-sm font-medium text-text-primary">
            {selectedIds.length} appointment{selectedIds.length !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedIds([])}
              className="text-sm text-text-secondary hover:text-text-primary"
            >
              Clear selection
            </button>
            <button
              onClick={() => setBulkEditOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded bg-real-estate px-4 text-sm font-semibold text-white hover:brightness-95 active:brightness-90"
            >
              <i className="mdi mdi-pencil-outline text-base" />
              Bulk Edit ({selectedIds.length})
            </button>
          </div>
        </div>
      )}
      <BulkEditModal
        selectedIds={selectedIds}
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        onSuccess={() => {
          setBulkEditOpen(false);
          setSelectedIds([]);
          refetch();
        }}
      />
    </>
  );
}
