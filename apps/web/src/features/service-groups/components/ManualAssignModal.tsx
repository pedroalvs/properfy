import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api';

interface Inspector {
  id: string;
  name: string;
  email: string;
}

interface ManualAssignModalProps {
  open: boolean;
  onClose: () => void;
  onAssign: (inspectorId: string) => void;
  serviceGroupId: string;
}

export function ManualAssignModal({ open, onClose, onAssign }: ManualAssignModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const handleAssign = () => {
    if (selectedId) {
      onAssign(selectedId);
      setSearch('');
      setSelectedId(null);
    }
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
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleAssign}
            disabled={!selectedId}
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
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded border border-black/10">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-text-muted">
              Loading inspectors...
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
