import { useState, useEffect, useMemo } from 'react';
import {
  CancellationReasonCode,
  RejectionReasonCode,
  SYSTEM_ONLY_REJECTION_CODES,
  allowedRejectionCodesFrom,
  formatReasonCodeLabel,
  type AppointmentStatus,
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

/**
 * The rejection reason options for a given source status (F07-3). The shared
 * `allowedRejectionCodesFrom` returns the general codes plus the origin-restricted
 * ones valid from that status (`INSPECTOR_NO_SHOW` only from `SCHEDULED`,
 * `NOT_EXECUTED` only from `DONE`); it does NOT drop the system-only codes, so we
 * still filter `SYSTEM_ONLY_REJECTION_CODES` (`INSPECTOR_UNABLE`, assigned only by
 * the system). With no source status (the dialog can be origin-blind), only the
 * general codes appear — never one that would be a guaranteed wrong-origin 422.
 */
function rejectionOptionsFrom(currentStatus: string | undefined) {
  return allowedRejectionCodesFrom((currentStatus ?? '') as AppointmentStatus)
    .filter((code) => !SYSTEM_ONLY_REJECTION_CODES.includes(code))
    .map((code) => ({ value: code, label: formatReasonCodeLabel(code) }));
}

/** Accountability codes whose choice carries a one-line reliability-score note (L-F07-01/04). */
const RELIABILITY_HINTS: Partial<Record<string, string>> = {
  [RejectionReasonCode.INSPECTOR_NO_SHOW]: "This counts against the inspector's reliability score.",
  [RejectionReasonCode.NOT_EXECUTED]: "Only this reason counts against the inspector's reliability score.",
};

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
   * The appointment's current status. Drives which rejection reasons are offered
   * (`INSPECTOR_NO_SHOW` only from `SCHEDULED`, `NOT_EXECUTED` only from `DONE`,
   * F07-3). Omitted for an origin-blind caller — only general codes appear then.
   */
  currentStatus?: string;
  /**
   * A server error to show inside the dialog without closing it — e.g. a
   * `422 REJECTION_CODE_NOT_ALLOWED` when the appointment's status changed in
   * another tab. The parent keeps `open` true and passes the message.
   */
  error?: string;
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
  currentStatus,
  error,
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
    if (targetStatus === 'REJECTED') return rejectionOptionsFrom(currentStatus);
    return null;
  }, [targetStatus, currentStatus]);

  const reliabilityHint = targetStatus === 'REJECTED' ? RELIABILITY_HINTS[reasonCode] : undefined;

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
          {reliabilityHint && <p className="mt-1 text-xs text-text-secondary">{reliabilityHint}</p>}
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
      {error && (
        <p className="mt-4 rounded bg-error/10 px-3 py-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
