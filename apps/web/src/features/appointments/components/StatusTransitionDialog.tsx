import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { Textarea } from '@/components/forms/Textarea';

interface StatusTransitionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  message: string;
  variant: 'danger' | 'warning';
  loading?: boolean;
}

export function StatusTransitionDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  variant,
  loading = false,
}: StatusTransitionDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) {
      setReason('');
    }
  }, [open]);

  const confirmButtonClass =
    variant === 'danger'
      ? 'bg-error text-white hover:brightness-95 active:brightness-90 h-9 px-4 rounded'
      : 'bg-warning text-white hover:brightness-95 active:brightness-90 h-9 px-4 rounded';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <button
            className={`inline-flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-150 select-none ${confirmButtonClass} ${
              !reason.trim() || loading ? 'pointer-events-none opacity-40' : 'cursor-pointer'
            }`}
            disabled={!reason.trim() || loading}
            onClick={() => onConfirm(reason.trim())}
          >
            {loading && <i className="mdi mdi-loading mdi-spin text-base" aria-hidden="true" />}
            Confirmar
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-text-secondary">{message}</p>
      <FormField label="Motivo" required>
        <Textarea
          value={reason}
          onChange={setReason}
          placeholder="Informe o motivo..."
          rows={3}
        />
      </FormField>
    </Dialog>
  );
}
