import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useSnackbar } from '@/hooks/useSnackbar';
import { AppointmentFilters } from '../components/AppointmentFilters';
import { AppointmentTable } from '../components/AppointmentTable';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { AppointmentBulkActionBar } from '../components/AppointmentBulkActionBar';
import { BulkEditModal } from '../components/BulkEditModal';
import { useAppointmentList } from '../hooks/useAppointmentList';
import { useBulkResendReminder } from '../hooks/useBulkResendReminder';

export function AppointmentListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
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

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const canCreate = canPerform('appointment.create');
  const canMapImport = canPerform('appointment.import');
  const canBulkEdit = canPerform('appointment.cancel');
  const canBulkResend = canPerform('appointment.bulk_resend_reminder');
  const canViewMap = true;
  // Board is the admin "Service Dashboard" (client scope §4.3) — AM/OP only.
  const canViewBoard = isGlobalRole;

  // `/appointments/new` redirects here with `?new=1` — the create form lives in
  // this drawer only, so there is no second copy to drift. The param is dropped
  // right away so a refresh or a Back navigation doesn't reopen the drawer.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    if (canCreate) {
      setEditId(null);
      setFormOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, canCreate]);

  const { showSuccess, showError } = useSnackbar();
  const bulkResend = useBulkResendReminder();
  const handleBulkResend = async () => {
    if (selectedIds.length === 0) return;
    try {
      // The backend buckets the per-day idempotency key in the platform
      // timezone (Sydney); no client timezone is sent.
      const response = await bulkResend.mutateAsync({
        appointmentIds: selectedIds,
      });
      const sent = response.data.results.filter((r) => r.status === 'SENT').length;
      const noPrimary = response.data.results.filter((r) => r.status === 'NO_PRIMARY_CONTACT').length;
      const replays = response.data.results.filter((r) => r.status === 'IDEMPOTENT_REPLAY').length;
      const errors = response.data.results.filter((r) => r.status === 'ERROR').length;
      showSuccess(
        `${sent} sent · ${noPrimary} no primary · ${replays} already sent today · ${errors} errors`,
      );
      setSelectedIds([]);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to re-send reminders');
    }
  };

  return (
    <>
      <ListFilterTableTemplate
        title="Appointments"
        primaryAction={canCreate ? { label: 'New Appointment', icon: 'mdi-plus', onClick: () => { setEditId(null); setFormOpen(true); } } : undefined}
        secondaryActions={[
          ...(canMapImport ? [{ label: 'Import', icon: 'mdi-upload', onClick: () => navigate('/appointments/import') }] : []),
          // Carry the active filters across — both screens read the same URL params.
          ...(canViewBoard ? [{ label: 'Board', icon: 'mdi-view-column-outline', onClick: () => navigate({ pathname: '/appointments/board', search: location.search }) }] : []),
          ...(canViewMap ? [{ label: 'Map View', icon: 'mdi-map-outline', onClick: () => navigate('/map') }] : []),
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
          selectedIds={canBulkEdit ? selectedIds : undefined}
          onSelectionChange={canBulkEdit ? setSelectedIds : undefined}
        />
      </ListFilterTableTemplate>
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
      {canBulkEdit && (
        <AppointmentBulkActionBar
          selectedCount={selectedIds.length}
          onClearSelection={() => setSelectedIds([])}
          onBulkEdit={() => setBulkEditOpen(true)}
          canBulkResend={canBulkResend}
          onBulkResend={handleBulkResend}
          resendPending={bulkResend.isPending}
        />
      )}
      <BulkEditModal
        selectedAppointments={data.filter((a) => selectedIds.includes(a.id))}
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
