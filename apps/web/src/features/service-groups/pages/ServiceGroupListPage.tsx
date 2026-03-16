import { useState } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ServiceGroupFilters } from '../components/ServiceGroupFilters';
import { ServiceGroupTable } from '../components/ServiceGroupTable';
import { ServiceGroupDetailDrawer } from '../components/ServiceGroupDetailDrawer';
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

  return (
    <>
      <ListFilterTableTemplate
        title="Grupos de Serviço"
        primaryAction={{ label: 'Novo Grupo', icon: 'mdi-plus', onClick: () => {} }}
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
      />
    </>
  );
}
