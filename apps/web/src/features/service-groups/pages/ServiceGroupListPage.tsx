import { useNavigate } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ServiceGroupFilters } from '../components/ServiceGroupFilters';
import { ServiceGroupTable } from '../components/ServiceGroupTable';
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

  return (
    <ListFilterTableTemplate
      title="Service Groups"
      primaryAction={{
        label: 'New Group',
        icon: 'mdi-plus',
        onClick: () => navigate('/service-groups/new'),
      }}
      secondaryActions={[
        { label: 'Map View', icon: 'mdi-map-outline', onClick: () => navigate('/map?mode=groups') },
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
  );
}
