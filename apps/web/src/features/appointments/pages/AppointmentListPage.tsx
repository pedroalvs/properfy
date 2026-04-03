import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRole } from '@properfy/shared';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useAuth } from '@/hooks/useAuth';
import { AppointmentFilters } from '../components/AppointmentFilters';
import { AppointmentTable } from '../components/AppointmentTable';
import { AppointmentDetailDrawer } from '../components/AppointmentDetailDrawer';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { useAppointmentList } from '../hooks/useAppointmentList';

const CAN_CREATE_ROLES: string[] = [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN];
const CAN_MAP_IMPORT_ROLES: string[] = [UserRole.AM, UserRole.OP];
const GLOBAL_ROLES: string[] = [UserRole.AM, UserRole.OP];

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
  } = useAppointmentList();

  const isGlobalRole = user ? GLOBAL_ROLES.includes(user.role) : false;

  const branchOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const apt of data) seen.set(apt.branchId, apt.branchName);
    return [
      { label: 'All', value: '' },
      ...Array.from(seen.entries()).map(([value, label]) => ({ label, value })),
    ];
  }, [data]);

  const serviceTypeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const apt of data) seen.set(apt.serviceTypeId, apt.serviceTypeName);
    return [
      { label: 'All', value: '' },
      ...Array.from(seen.entries()).map(([value, label]) => ({ label, value })),
    ];
  }, [data]);

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
          { label: 'Import', icon: 'mdi-upload', onClick: () => navigate('/appointments/import') },
        ] : []}
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
