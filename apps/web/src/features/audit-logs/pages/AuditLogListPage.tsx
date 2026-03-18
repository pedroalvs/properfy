import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { AuditLogFilters } from '../components/AuditLogFilters';
import { AuditLogTable } from '../components/AuditLogTable';
import { AuditLogDetailDrawer } from '../components/AuditLogDetailDrawer';
import { useAuditLogList } from '../hooks/useAuditLogList';
import type { AuditLog } from '../types';

export function AuditLogListPage() {
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
  } = useAuditLogList();

  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleView = useCallback((log: AuditLog) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedLog(null);
  }, []);

  return (
    <>
      <ListFilterTableTemplate title="Audit Logs">
        <AuditLogFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <AuditLogTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load audit logs') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
          onView={handleView}
        />
      </ListFilterTableTemplate>
      <AuditLogDetailDrawer
        log={selectedLog}
        open={drawerOpen}
        onClose={handleCloseDrawer}
      />
    </>
  );
}
