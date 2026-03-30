import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';

interface Inspector {
  id: string;
  name: string;
  email: string;
}

interface AssignInspectorModalProps {
  open: boolean;
  appointmentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignInspectorModal({
  open,
  appointmentId,
  onClose,
  onSuccess,
}: AssignInspectorModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const { data, isLoading } = useQuery({
    queryKey: ['inspectors', 'active', search],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/inspectors' as any, {
        params: {
          query: { status: 'ACTIVE', search: search || undefined, page: 1, pageSize: 50 } as any,
        },
      });
      if (error) throw new Error('Failed to load inspectors');
      return (data as any)?.data as Inspector[] ?? [];
    },
    enabled: open,
  });

  const inspectors = data ?? [];

  const handleAssign = async () => {
    if (!selectedId) return;
    setIsAssigning(true);
    const { error } = await api.POST(
      `/v1/appointments/${appointmentId}/status-transitions` as any,
      {
        body: { targetStatus: 'SCHEDULED', inspectorId: selectedId } as any,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      },
    );
    setIsAssigning(false);
    if (error) {
      showError((error as any)?.error?.message ?? 'Failed to assign inspector');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    await queryClient.invalidateQueries({ queryKey: ['appointments', appointmentId] });
    showSuccess('Inspector assigned');
    onSuccess();
  };

  const handleClose = () => {
    setSearch('');
    setSelectedId(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Assign Inspector"
      maxWidth="520px"
      actions={
        <>
          <Button variant="outlined" onClick={handleClose} disabled={isAssigning}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleAssign}
            disabled={!selectedId || isAssigning}
            loading={isAssigning}
            data-testid="assign-confirm-button"
          >
            Assign
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <i className="mdi mdi-magnify absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-black/15 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
            data-testid="inspector-search-input"
          />
        </div>

        <div
          className="max-h-64 overflow-y-auto rounded border border-black/10"
          data-testid="inspector-list"
        >
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-text-muted">
              Loading inspectors…
            </div>
          )}
          {!isLoading && inspectors.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sm text-text-muted">
              No active inspectors found.
            </div>
          )}
          {!isLoading && inspectors.map((inspector) => (
            <button
              key={inspector.id}
              type="button"
              onClick={() => setSelectedId(inspector.id)}
              data-testid={`inspector-row-${inspector.id}`}
              className={[
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                'hover:bg-black/5 border-b border-black/8 last:border-b-0',
                selectedId === inspector.id ? 'bg-primary/8' : '',
              ].join(' ')}
            >
              <div className={[
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                selectedId === inspector.id
                  ? 'border-primary bg-primary'
                  : 'border-text-muted bg-white',
              ].join(' ')}>
                {selectedId === inspector.id && (
                  <div className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{inspector.name}</p>
                <p className="truncate text-xs text-text-muted">{inspector.email}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
