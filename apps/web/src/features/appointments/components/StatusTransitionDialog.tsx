import { useState, useEffect, useMemo } from 'react';
import {
  CancellationReasonCode,
  RejectionReasonCode,
  SYSTEM_ONLY_REJECTION_CODES,
  ORIGIN_RESTRICTED_REJECTION_CODES,
  formatReasonCodeLabel,
} from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { Textarea } from '@/components/forms/Textarea';
import { Checkbox } from '@/components/forms/Checkbox';

/**
 * Assigned only by the daily auto-cancel sweep, never chosen by a person — an
 * operator cancelling by hand always has a real reason. Excluded explicitly because
 * the option list is derived from the enum and would otherwise pick it up.
 */
const SYSTEM_ONLY_CANCELLATION_CODES: CancellationReasonCode[] = [CancellationReasonCode.EXPIRED];

// Labels come from the shared humanizer so the dialog, the appointments table's
// Cancellation Reason column and the XLSX export always read a code the same way.
const CANCELLATION_OPTIONS = Object.values(CancellationReasonCode)
  .filter((code) => !SYSTEM_ONLY_CANCELLATION_CODES.includes(code))
  .map((code) => ({ value: code, label: formatReasonCodeLabel(code) }));

// Two exclusions, both isolated filter steps so TASK-F07-3 can swap them for a
// single `allowedRejectionCodesFrom(fromStatus)` once the dialog is given the
// source status.
//   1. SYSTEM_ONLY_REJECTION_CODES (INSPECTOR_UNABLE): assigned only by the
//      system when the inspector reports "Can't do this job"; the backend
//      refuses a human picking it.
//   2. ORIGIN_RESTRICTED_REJECTION_CODES (INSPECTOR_NO_SHOW, NOT_EXECUTED): valid
//      only from one source status each (SCHEDULED / DONE). This dialog knows the
//      target status but not the source, so any choice here would be a guaranteed
//      422 REJECTION_CODE_NOT_ALLOWED from the wrong origin — hidden until F07-3
//      wires the origin filter.
const REJECTION_OPTIONS = Object.values(RejectionReasonCode)
  .filter(
    (code) =>
      !SYSTEM_ONLY_REJECTION_CODES.includes(code) &&
      !ORIGIN_RESTRICTED_REJECTION_CODES.includes(code),
  )
  .map((code) => ({ value: code, label: formatReasonCodeLabel(code) }));

export interface StatusTransitionConfirmPayload {
  reason: string;
  reasonCode?: string;
  /** Cancellation only; always false unless the operator ticked the box. */
  notifyRentalTenant: boolean;
}

interface StatusTransitionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: StatusTransitionConfirmPayload) => void;
  title: string;
  message: string;
  variant: 'danger' | 'warning';
  targetStatus?: string;
  /**
   * Whether the rental tenant has already been told this inspection exists.
   * Gates the "notify the tenant" checkbox: there is no point offering to tell
   * someone the inspection is off when they were never told it was on. The
   * backend enforces the authoritative version of this rule independently.
   */
  rentalTenantNotified?: boolean;
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
  rentalTenantNotified = false,
  loading = false,
}: StatusTransitionDialogProps) {
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [notifyRentalTenant, setNotifyRentalTenant] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason('');
      setReasonCode('');
      setNotifyRentalTenant(false);
    }
  }, [open]);

  const reasonCodeOptions = useMemo(() => {
    if (targetStatus === 'CANCELLED') return CANCELLATION_OPTIONS;
    if (targetStatus === 'REJECTED') return REJECTION_OPTIONS;
    return null;
  }, [targetStatus]);

  const showNotifyRentalTenant = targetStatus === 'CANCELLED' && rentalTenantNotified;

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
    onConfirm({
      reason: finalReason,
      reasonCode: reasonCode || undefined,
      // Never leak an opt-in from a transition that does not offer the choice.
      notifyRentalTenant: showNotifyRentalTenant && notifyRentalTenant,
    });
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
            className={cn(
              'inline-flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-150 select-none',
              confirmButtonClass,
              !isValid || loading ? 'pointer-events-none opacity-40' : 'cursor-pointer',
            )}
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
      {showNotifyRentalTenant && (
        <div className="mt-4">
          <Checkbox
            checked={notifyRentalTenant}
            onChange={setNotifyRentalTenant}
            label="Notify the tenant by email/SMS"
          />
          <p className="mt-1 text-xs text-text-muted">
            The tenant has already been told about this inspection. Leave unchecked to
            cancel without contacting them. The agency is notified either way.
          </p>
        </div>
      )}
    </Dialog>
  );
}
