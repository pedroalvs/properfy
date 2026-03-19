import { useState, useEffect, useMemo } from 'react';
import { CancellationReasonCode, RejectionReasonCode } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { Textarea } from '@/components/forms/Textarea';

const CANCELLATION_OPTIONS = Object.values(CancellationReasonCode).map((code) => ({
  value: code,
  label: code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
}));

const REJECTION_OPTIONS = Object.values(RejectionReasonCode).map((code) => ({
  value: code,
  label: code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
}));

interface StatusTransitionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, reasonCode?: string) => void;
  title: string;
  message: string;
  variant: 'danger' | 'warning';
  targetStatus?: string;
  loading?: boolean;
}

export function StatusTransitionDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  variant,
  targetStatus,
  loading = false,
}: StatusTransitionDialogProps) {
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState('');

  useEffect(() => {
    if (!open) {
      setReason('');
      setReasonCode('');
    }
  }, [open]);

  const reasonCodeOptions = useMemo(() => {
    if (targetStatus === 'CANCELLED') return CANCELLATION_OPTIONS;
    if (targetStatus === 'REJECTED') return REJECTION_OPTIONS;
    return null;
  }, [targetStatus]);

  const showFreeText = !reasonCodeOptions || reasonCode === 'OTHER';
  const isValid = reasonCodeOptions
    ? reasonCode && (reasonCode !== 'OTHER' || reason.trim())
    : reason.trim();

  const confirmButtonClass =
    variant === 'danger'
      ? 'bg-error text-white hover:brightness-95 active:brightness-90 h-9 px-4 rounded'
      : 'bg-warning text-white hover:brightness-95 active:brightness-90 h-9 px-4 rounded';

  const handleConfirm = () => {
    const codeLabel = reasonCode && reasonCode !== 'OTHER'
      ? reasonCode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : '';
    const finalReason = reason.trim() || codeLabel;
    onConfirm(finalReason, reasonCode || undefined);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <button
            className={`inline-flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-150 select-none ${confirmButtonClass} ${
              !isValid || loading ? 'pointer-events-none opacity-40' : 'cursor-pointer'
            }`}
            disabled={!isValid || loading}
            onClick={handleConfirm}
          >
            {loading && <i className="mdi mdi-loading mdi-spin text-base" aria-hidden="true" />}
            Confirm
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-text-secondary">{message}</p>
      {reasonCodeOptions && (
        <FormField label="Reason Code" required>
          <SelectInput
            value={reasonCode}
            onChange={setReasonCode}
            options={reasonCodeOptions}
            placeholder="Select a reason..."
            aria-label="Reason Code"
          />
        </FormField>
      )}
      {showFreeText && (
        <FormField label={reasonCodeOptions ? 'Additional Details' : 'Reason'} required={!reasonCodeOptions}>
          <Textarea
            value={reason}
            onChange={setReason}
            placeholder="Enter the reason..."
            rows={3}
          />
        </FormField>
      )}
    </Dialog>
  );
}
