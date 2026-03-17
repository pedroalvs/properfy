import { useState } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import type { FilterSelectOption } from '@/components/filters/FilterSelect';
import { AppointmentFilters } from '../components/AppointmentFilters';
import { AppointmentTable } from '../components/AppointmentTable';
import { AppointmentDetailDrawer } from '../components/AppointmentDetailDrawer';
import { AppointmentFormDrawer } from '../components/AppointmentFormDrawer';
import { useAppointmentList } from '../hooks/useAppointmentList';

const BRANCH_OPTIONS: FilterSelectOption[] = [
  { label: 'Todas', value: '' },
  { label: 'Filial Centro', value: 'branch-1' },
  { label: 'Filial Norte', value: 'branch-2' },
];

export function AppointmentListPage() {
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <>
      <ListFilterTableTemplate
        title="Vistorias"
        primaryAction={{ label: 'Nova Vistoria', icon: 'mdi-plus', onClick: () => { setEditId(null); setFormOpen(true); } }}
      >
        <AppointmentFilters
          filters={filters}
          onFiltersChange={setFilters}
          branchOptions={BRANCH_OPTIONS}
        />
        <AppointmentTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Erro ao carregar vistorias') : undefined}
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
