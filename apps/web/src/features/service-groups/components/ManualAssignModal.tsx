import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FilterInput } from '@/components/filters/FilterInput';
import { FormField } from '@/components/forms/FormField';
import { Textarea } from '@/components/forms/Textarea';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { api } from '@/services/api';

interface Inspector {
  id: string;
  name: string;
  email: string;
}

interface ManualAssignModalProps {
  open: boolean;
  onClose: () => void;
  /** `reason` is only populated in replacement mode. */
  onAssign: (inspectorId: string, reason: string) => void;
  serviceGroupId: string;
  /** The group's current assignee. Drives the replacement copy and warning. */
  currentInspector?: { id: string; name: string } | null;
  /**
   * Replacing means revoking a commitment the outgoing inspector already made,
   * so a reason is mandatory (root CLAUDE.md 5) and both parties get notified.
   */
  isReplacement?: boolean;
  loading?: boolean;
}

const MIN_REASON_LENGTH = 3;

export function ManualAssignModal({
  open,
  onClose,
  onAssign,
  currentInspector = null,
  isReplacement = false,
  loading = false,
}: ManualAssignModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedId(null);
      setReason('');
    }
  }, [open]);

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

  // You cannot replace someone with themselves, so the current assignee is not
  // offered — which also keeps "a selection exists" a sufficient submit guard.
  const inspectors = (data ?? []).filter((i) => i.id !== currentInspector?.id);

  const trimmedReason = reason.trim();
  const canSubmit =
    !!selectedId && !loading && (!isReplacement || trimmedReason.length >= MIN_REASON_LENGTH);

  const handleAssign = () => {
    if (!canSubmit) return;
    onAssign(selectedId!, trimmedReason);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isReplacement ? 'Change Inspector' : 'Assign Inspector'}
      maxWidth="520px"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAssign} disabled={!canSubmit}>
            {isReplacement ? 'Replace inspector' : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {currentInspector && (
          <InfoBanner variant="warning">
            Currently assigned to <strong>{currentInspector.name}</strong>. Replacing will notify
            both {currentInspector.name} and the new inspector.
          </InfoBanner>
        )}

        <FilterInput
          label="Search inspectors"
          value={search}
          onChange={setSearch}
          placeholder="Name or email"
        />

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

        {isReplacement && (
          <FormField label="Reason">
            <Textarea
              value={reason}
              onChange={setReason}
              rows={2}
              placeholder="Why is this group changing hands?"
              aria-label="Reason"
            />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}
