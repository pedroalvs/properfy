import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { FilterSegmented } from '@/components/filters/FilterSegmented';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useInspectorNoticeList } from '../hooks/useInspectorNoticeList';
import { InspectorNoticeTable } from '../components/InspectorNoticeTable';
import { NewInspectorNoticeDrawer } from '../components/NewInspectorNoticeDrawer';
import type { InspectorNoticeStatusFilter } from '../types';

const STATUS_OPTIONS: Array<{ label: string; value: InspectorNoticeStatusFilter }> = [
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
  { label: 'All', value: 'all' },
];

function emptyTitle(status: InspectorNoticeStatusFilter): string {
  return status === 'archived' ? 'No archived notices' : 'No notices yet';
}

export function InspectorNoticeListPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, status, setStatus, pagination } = useInspectorNoticeList();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openNotice = useCallback((id: string) => navigate(`/inspector-notices/${id}`), [navigate]);

  const isEmpty = !isLoading && !isError && data.length === 0;

  return (
    <>
      <ListFilterTableTemplate
        title="Inspector notices"
        primaryAction={{ label: 'New notice', icon: 'mdi-plus', onClick: () => setDrawerOpen(true) }}
      >
        <p className="-mt-2 mb-4 text-sm text-text-secondary">Messages sent to inspectors&apos; app</p>
        <FilterSegmented
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => setStatus(value as InspectorNoticeStatusFilter)}
        />
        {isEmpty ? (
          <EmptyState
            title={emptyTitle(status)}
            description={status === 'active' ? 'Publish a notice to reach inspectors in their app.' : undefined}
            action={status === 'active' ? { label: 'New notice', onClick: () => setDrawerOpen(true) } : undefined}
          />
        ) : (
          <InspectorNoticeTable
            data={data}
            loading={isLoading}
            error={isError ? "Couldn't load notices." : undefined}
            onRetryError={refetch}
            pagination={pagination}
            onOpen={openNotice}
            emptyMessage={emptyTitle(status)}
          />
        )}
      </ListFilterTableTemplate>

      <NewInspectorNoticeDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onPublished={refetch} />
    </>
  );
}
