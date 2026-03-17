import { useState } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ServiceGroupFilters } from '../components/ServiceGroupFilters';
import { ServiceGroupTable } from '../components/ServiceGroupTable';
import { ServiceGroupDetailDrawer } from '../components/ServiceGroupDetailDrawer';
import { ServiceGroupFormDrawer } from '../components/ServiceGroupFormDrawer';
import { useServiceGroupList } from '../hooks/useServiceGroupList';

export function ServiceGroupListPage() {
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
  } = useServiceGroupList();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <>
      <ListFilterTableTemplate
        title="Grupos de Serviço"
        primaryAction={{
          label: 'Novo Grupo',
          icon: 'mdi-plus',
          onClick: () => {
            setEditId(null);
            setFormOpen(true);
          },
        }}
      >
        <ServiceGroupFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <ServiceGroupTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Erro ao carregar grupos de serviço') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
          onView={(sg) => {
            setSelectedId(sg.id);
            setDrawerOpen(true);
          }}
          onEdit={(sg) => {
            setSelectedId(sg.id);
            setDrawerOpen(true);
          }}
        />
      </ListFilterTableTemplate>
      <ServiceGroupDetailDrawer
        serviceGroupId={selectedId}
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
      <ServiceGroupFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        serviceGroupId={editId}
        onSaved={() => {
          setFormOpen(false);
          setEditId(null);
          refetch();
        }}
      />
    </>
  );
}
