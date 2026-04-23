import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { NoPermissionState } from '@/components/feedback/NoPermissionState';
import { AuditLogFilters } from '../components/AuditLogFilters';
import { AuditLogTable } from '../components/AuditLogTable';
import { AuditLogDetailDrawer } from '../components/AuditLogDetailDrawer';
import { useAuditLogList } from '../hooks/useAuditLogList';
import { usePermissions } from '@/hooks/usePermissions';
import type { AuditLog } from '../types';

export function AuditLogListPage() {
  const { hasRole, role } = usePermissions();
  const canViewAuditLogs = hasRole('AM', 'OP', 'CL_ADMIN');

  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
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

  if (role && !canViewAuditLogs) {
    return (
      <ListFilterTableTemplate title="Audit Logs">
        <NoPermissionState message="You don't have permission to view audit logs." />
      </ListFilterTableTemplate>
    );
  }

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
