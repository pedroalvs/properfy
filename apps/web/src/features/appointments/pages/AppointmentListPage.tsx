import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRole } from '@properfy/shared';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useAuth } from '@/hooks/useAuth';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { AppointmentFilters } from '../components/AppointmentFilters';
import { AppointmentTable } from '../components/AppointmentTable';
import { AppointmentDetailDrawer } from '../components/AppointmentDetailDrawer';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { useAppointmentList } from '../hooks/useAppointmentList';

interface BranchItem {
  id: string;
  name: string;
}

function useBranchFilterOptions() {
  const { data: response, isLoading } = usePaginatedQuery<BranchItem>(
    ['branches'],
    '/v1/branches',
    { pageSize: 100 },
  );

  const options = useMemo(
    () => [
      { label: 'All', value: '' },
      ...(response?.data ?? []).map((b) => ({ label: b.name, value: b.id })),
    ],
    [response],
  );

  return { options, isLoading };
}

const CAN_CREATE_ROLES: string[] = [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN];
const CAN_MAP_IMPORT_ROLES: string[] = [UserRole.AM, UserRole.OP];

export function AppointmentListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
  } = useAppointmentList();

  const { options: branchOptions } = useBranchFilterOptions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const canCreate = user ? CAN_CREATE_ROLES.includes(user.role) : false;
  const canMapImport = user ? CAN_MAP_IMPORT_ROLES.includes(user.role) : false;

  return (
    <>
      <ListFilterTableTemplate
        title="Appointments"
        primaryAction={canCreate ? { label: 'New Appointment', icon: 'mdi-plus', onClick: () => { setEditId(null); setFormOpen(true); } } : undefined}
        secondaryActions={canMapImport ? [
          { label: 'Map', icon: 'mdi-map-outline', onClick: () => navigate('/appointments/map') },
          { label: 'Import', icon: 'mdi-upload', onClick: () => navigate('/appointments/import') },
        ] : []}
      >
        <AppointmentFilters
          filters={filters}
          onFiltersChange={setFilters}
          branchOptions={branchOptions}
        />
        <AppointmentTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load appointments') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
          onView={(apt) => {
            setSelectedId(apt.id);
            setDrawerOpen(true);
          }}
          onEdit={(apt) => {
            setSelectedId(apt.id);
            setDrawerOpen(true);
          }}
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
    </>
  );
}
