import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ServiceGroupFilters } from '../components/ServiceGroupFilters';
import { ServiceGroupTable } from '../components/ServiceGroupTable';
import { ServiceGroupDetailDrawer } from '../components/ServiceGroupDetailDrawer';
import { useServiceGroupList } from '../hooks/useServiceGroupList';

export function ServiceGroupListPage() {
  const navigate = useNavigate();
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = useServiceGroupList();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <ListFilterTableTemplate
        title="Service Groups"
        primaryAction={{
          label: 'New Group',
          icon: 'mdi-plus',
          onClick: () => navigate('/service-groups/new'),
        }}
        secondaryActions={[
          { label: 'Map View', icon: 'mdi-map-outline', onClick: () => navigate('/service-groups/map') },
        ]}
      >
        <ServiceGroupFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <ServiceGroupTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load service groups') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          onView={(sg) => navigate(`/service-groups/${sg.id}`)}
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
