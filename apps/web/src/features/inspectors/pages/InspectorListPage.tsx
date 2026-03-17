import { useState } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { InspectorFilters } from '../components/InspectorFilters';
import { InspectorTable } from '../components/InspectorTable';
import { InspectorDetailDrawer } from '../components/InspectorDetailDrawer';
import { InspectorFormDrawer } from '../components/InspectorFormDrawer';
import { useInspectorList } from '../hooks/useInspectorList';

export function InspectorListPage() {
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
  } = useInspectorList();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <>
      <ListFilterTableTemplate
        title="Inspectors"
        primaryAction={{
          label: 'New Inspector',
          icon: 'mdi-plus',
          onClick: () => {
            setEditId(null);
            setFormOpen(true);
          },
        }}
      >
        <InspectorFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <InspectorTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load inspectors') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
          onView={(insp) => {
            setSelectedId(insp.id);
            setDrawerOpen(true);
          }}
          onEdit={(insp) => {
            setSelectedId(insp.id);
            setDrawerOpen(true);
          }}
        />
      </ListFilterTableTemplate>
      <InspectorDetailDrawer
        inspectorId={selectedId}
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
      <InspectorFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        inspectorId={editId}
        onSaved={() => {
          setFormOpen(false);
          setEditId(null);
          refetch();
        }}
      />
    </>
  );
}
