import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { TableSwitch } from '@/components/data/TableSwitch';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/hooks/useSnackbar';
import { getErrorMessage } from '@/lib/api-error';
import { AppointmentFilters } from '../components/AppointmentFilters';
import { AppointmentTable } from '../components/AppointmentTable';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { AppointmentBulkActionBar } from '../components/AppointmentBulkActionBar';
import { BulkEditModal } from '../components/BulkEditModal';
import { useAppointmentList } from '../hooks/useAppointmentList';
import {
  useServiceTypeFilterOptions,
  useAgencyFilterOptions,
  useInspectorFilterOptions,
  useBranchFilterOptions,
  useSuburbFilterOptions,
} from '../hooks/useAppointmentFilterOptions';
import { useAppointmentExport } from '../hooks/useAppointmentExport';
import { useBulkResendHandler } from '../hooks/useBulkResendHandler';

export function AppointmentListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canPerform, hasRole } = usePermissions();
  const isGlobalRole = hasRole('AM', 'OP');
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

  const serviceTypeOptions = useServiceTypeFilterOptions();
  const agencyOptions = useAgencyFilterOptions();
  const inspectorOptions = useInspectorFilterOptions();
  const branchOptions = useBranchFilterOptions(filters.tenantId, data);
  const suburbOptions = useSuburbFilterOptions(filters.tenantId);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  // View preference, not a filter — deliberately local rather than in the URL,
  // so a shared link carries the data selection without the reader's layout.
  const [showExtraColumns, setShowExtraColumns] = useState(false);

  const { exportAppointments, isExporting } = useAppointmentExport();
  const { showError } = useSnackbar();

  const handleExport = useCallback(async () => {
    try {
      await exportAppointments(filters);
    } catch (error) {
      // Most likely the server-side row cap — surface its message so the
      // operator knows to narrow the filters rather than retrying blindly.
      showError(getErrorMessage(error, 'Failed to generate the spreadsheet'));
    }
  }, [exportAppointments, filters, showError]);

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

  const clearSelection = useCallback(() => setSelectedIds([]), []);
  const bulkResend = useBulkResendHandler(selectedIds, clearSelection);

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
          // Exports the whole filtered set (server-capped), not the visible page.
          {
            label: isExporting ? 'Generating...' : 'Generate Excel',
            icon: 'mdi-file-excel-outline',
            disabled: isExporting,
            onClick: handleExport,
          },
        ]}
      >
        <AppointmentFilters
          filters={filters}
          onFiltersChange={setFilters}
          branchOptions={branchOptions}
          serviceTypeOptions={serviceTypeOptions}
          suburbOptions={suburbOptions}
          agencyOptions={agencyOptions}
          inspectorOptions={inspectorOptions}
        />
        <TableSwitch
          enabled={showExtraColumns}
          onChange={setShowExtraColumns}
          label="Show additional columns"
        />
        <AppointmentTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load appointments') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          showAgency={isGlobalRole}
          showExtraColumns={showExtraColumns}
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
          onClearSelection={clearSelection}
          onBulkEdit={() => setBulkEditOpen(true)}
          canBulkResend={canBulkResend}
          onBulkResend={bulkResend.resend}
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
