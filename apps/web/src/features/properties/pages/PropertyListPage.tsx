import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRole } from '@properfy/shared';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useAuth } from '@/hooks/useAuth';
import type { FilterSelectOption } from '@/components/filters/FilterSelect';
import { PropertyFilters } from '../components/PropertyFilters';
import { PropertyTable } from '../components/PropertyTable';
import { PropertyDetailDrawer } from '../components/PropertyDetailDrawer';
import { PropertyFormDrawer } from '../components/PropertyFormDrawer';
import { usePropertyList } from '../hooks/usePropertyList';

const BRANCH_OPTIONS: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Filial Centro', value: 'branch-1' },
  { label: 'Filial Norte', value: 'branch-2' },
];

const CAN_CREATE_ROLES: string[] = [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN];

export function PropertyListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = user ? CAN_CREATE_ROLES.includes(user.role) : false;
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
  } = usePropertyList();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <>
      <ListFilterTableTemplate
        title="Properties"
        primaryAction={canCreate ? {
          label: 'New Property',
          icon: 'mdi-plus',
          onClick: () => navigate('/properties/new'),
        } : undefined}
        secondaryActions={[
          { label: 'Map', icon: 'mdi-map-outline', onClick: () => navigate('/properties/map') },
          { label: 'Import', icon: 'mdi-upload', onClick: () => navigate('/properties/import') },
        ]}
      >
        <PropertyFilters
          filters={filters}
          onFiltersChange={setFilters}
          branchOptions={BRANCH_OPTIONS}
        />
        <PropertyTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load properties') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
          onView={(prop) => {
            navigate(`/properties/${prop.id}`);
          }}
          onEdit={(prop) => {
            setSelectedId(prop.id);
            setDrawerOpen(true);
          }}
        />
      </ListFilterTableTemplate>
      <PropertyDetailDrawer
        propertyId={selectedId}
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
      <PropertyFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        propertyId={editId}
        onSaved={() => {
          setFormOpen(false);
          setEditId(null);
          refetch();
        }}
      />
    </>
  );
}
