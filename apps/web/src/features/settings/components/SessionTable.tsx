import { useCallback } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/lib/format-date';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useSessionList } from '../hooks/useSessionList';
import { useSessionRevoke } from '../hooks/useSessionRevoke';
import type { Session } from '../types';
import { useState } from 'react';

export function SessionTable() {
  const { sessions, isLoading, isError, isNotFound, refetch } = useSessionList();
  const { revoke } = useSessionRevoke();
  const { showSuccess, showError } = useSnackbar();
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const handleRevoke = useCallback(async () => {
    if (!confirmRevokeId) return;

    const result = await revoke(confirmRevokeId);
    if (result.success) {
      showSuccess('Session revoked');
    } else {
      showError(result.error ?? 'Failed to revoke session');
    }
    setConfirmRevokeId(null);
  }, [confirmRevokeId, revoke, showSuccess, showError]);

  const columns: DataTableColumn<Session>[] = [
    {
      key: 'userAgent',
      label: 'Device',
      width: '240px',
      render: (row) => <>{row.userAgent ?? 'Unknown device'}</>,
    },
    {
      key: 'ipAddress',
      label: 'IP Address',
      width: '140px',
      render: (row) => <>{row.ipAddress ?? '—'}</>,
    },
    {
      key: 'lastActiveAt',
      label: 'Last Active',
      width: '160px',
      render: (row) => <>{formatDateTime(row.lastActiveAt)}</>,
    },
    {
      key: 'isCurrent',
      label: '',
      width: '100px',
      render: (row) =>
        row.isCurrent ? (
          <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
            Current
          </span>
        ) : null,
    },
    {
      key: 'actions',
      label: '',
      width: '60px',
      render: (row) =>
        !row.isCurrent ? (
          <RowActions
            actions={[
              {
                icon: 'mdi-logout',
                label: 'Revoke',
                onClick: () => setConfirmRevokeId(row.id),
              },
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-secondary">Active Sessions</h3>
      {isNotFound ? (
        <p className="py-6 text-center text-sm text-text-secondary">
          Session management is not available yet.
        </p>
      ) : (
        <DataTable<Session>
          columns={columns}
          data={sessions}
          loading={isLoading}
          error={isError ? 'Failed to load sessions' : undefined}
          onRetryError={refetch}
          keyExtractor={(row) => row.id}
        />
      )}

      <ConfirmDialog
        open={!!confirmRevokeId}
        title="Revoke session?"
        message="This will sign out the device immediately."
        confirmLabel="Revoke"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={handleRevoke}
        onClose={() => setConfirmRevokeId(null)}
      />
    </div>
  );
}
