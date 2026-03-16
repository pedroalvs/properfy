import { useState } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { UserFilters } from '../components/UserFilters';
import { UserTable } from '../components/UserTable';
import { UserDetailDrawer } from '../components/UserDetailDrawer';
import { useUserList } from '../hooks/useUserList';

export function UserListPage() {
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
  } = useUserList();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <ListFilterTableTemplate
        title="Usuários"
        primaryAction={{ label: 'Novo Usuário', icon: 'mdi-plus', onClick: () => {} }}
      >
        <UserFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <UserTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Erro ao carregar usuários') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
          onView={(user) => {
            setSelectedId(user.id);
            setDrawerOpen(true);
          }}
          onEdit={(user) => {
            setSelectedId(user.id);
            setDrawerOpen(true);
          }}
        />
      </ListFilterTableTemplate>
      <UserDetailDrawer
        userId={selectedId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedId(null);
        }}
      />
    </>
  );
}
