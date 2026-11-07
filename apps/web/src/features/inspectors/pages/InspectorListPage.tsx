import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { InspectorFilters } from '../components/InspectorFilters';
import { InspectorTable } from '../components/InspectorTable';
import { InspectorDetailDrawer } from '../components/InspectorDetailDrawer';
import { InspectorFormDrawer } from '../components/InspectorFormDrawer';
import { useInspectorList } from '../hooks/useInspectorList';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `?open=` deep link only honours a well-formed uuid (L-F05-14); anything else is ignored. */
function parseOpenId(raw: string | null): string | null {
  return raw && UUID_RE.test(raw) ? raw : null;
}

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
  } = useInspectorList();

  const [searchParams, setSearchParams] = useSearchParams();
  const openId = parseOpenId(searchParams.get('open'));

  // Initialise from the deep link so a direct `/inspectors?open=<id>` load opens
  // the drawer without a closed-then-open flash (L-F05-14).
  const [selectedId, setSelectedId] = useState<string | null>(openId);
  const [drawerOpen, setDrawerOpen] = useState(openId !== null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Open the drawer when the `?open=` id changes to a valid uuid while mounted.
  useEffect(() => {
    if (openId) {
      setSelectedId(openId);
      setDrawerOpen(true);
    }
  }, [openId]);

  // Close the drawer and drop the `?open=` param (replace — no extra history entry),
  // so the browser Back button returns to wherever the user came from (e.g. the Live Day).
  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedId(null);
    if (searchParams.has('open')) {
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }
  };

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
          emptyMessage={
            filters.missingBaseAddress ? 'No inspectors without a base address.' : undefined
          }
          onView={(insp) => {
            setSelectedId(insp.id);
            setDrawerOpen(true);
          }}
        />
      </ListFilterTableTemplate>
      <InspectorDetailDrawer
        inspectorId={selectedId}
        open={drawerOpen}
        onClose={closeDrawer}
        onEdit={(id) => {
          closeDrawer();
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
