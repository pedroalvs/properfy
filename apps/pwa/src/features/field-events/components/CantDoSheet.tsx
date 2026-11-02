import { useEffect, useId, useRef, useState } from 'react';
import {
  FieldIssueReason,
  FIELD_ISSUE_REASON_LABELS,
  FIELD_ISSUE_NOTE_REQUIRED_REASONS,
} from '@properfy/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/Sheet';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { useReportCantDo } from '../hooks/useReportCantDo';
import { captureOptionalLocation } from '../lib/optional-location';
import { fieldEventErrorMessage } from '../lib/field-event-error';

const NOTE_MAX = 500;
const REASONS = Object.values(FieldIssueReason);

interface CantDoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  appointmentCode: string;
  propertyAddress: string;
  /** Called after a successful report (e.g. to navigate away from the detail). */
  onReported?: () => void;
}

export function CantDoSheet({
  open,
  onOpenChange,
  appointmentId,
  appointmentCode,
  propertyAddress,
  onReported,
}: CantDoSheetProps) {
  const isOnline = useIsOnline();
  const { showSuccess } = useSnackbar();
  const mutation = useReportCantDo(appointmentId);
  const [reason, setReason] = useState<FieldIssueReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Stable per-open idempotency key so a double tap can't create two reports.
  const idempotencyKey = useRef<string>(generateIdempotencyKey());
  // Guards against a synchronous double tap: `mutation.isPending` only flips on
  // the next render, so two taps in the same tick would both pass that check.
  const submittingRef = useRef(false);
  const noteHintId = useId();
  const sharedHintId = useId();

  // Reset the form (and mint a fresh idempotency key) each time the sheet opens.
  useEffect(() => {
    if (open) {
      setReason(null);
      setNote('');
      setError(null);
      idempotencyKey.current = generateIdempotencyKey();
    }
  }, [open]);

  const noteRequired = reason != null && FIELD_ISSUE_NOTE_REQUIRED_REASONS.includes(reason);
  const noteMissing = noteRequired && note.trim().length === 0;
  const canSend = isOnline && reason != null && !noteMissing && !mutation.isPending;

  const handleSend = async () => {
    if (!reason || !canSend || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    const position = await captureOptionalLocation();
    try {
      await mutation.mutateAsync({
        body: { reason, note: note.trim() || undefined, ...(position ?? {}) },
        idempotencyKey: idempotencyKey.current,
      });
      onOpenChange(false);
      showSuccess('Sent to operations. This job has been removed from your route.');
      onReported?.();
    } catch (err) {
      setError(fieldEventErrorMessage(err));
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Can&apos;t do this job</SheetTitle>
          <SheetDescription>
            {appointmentCode} · {propertyAddress}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-4 overflow-y-auto">
          {!isOnline && (
            <Alert tone="warning" data-testid="cant-do-offline">
              <span>You need a connection to report this. Try again when you&apos;re back online.</span>
            </Alert>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-foreground">Reason</legend>
            {REASONS.map((value, index) => (
              <label
                key={value}
                className="flex items-center gap-3 rounded-card border border-border bg-card p-3 text-sm text-foreground"
              >
                <input
                  type="radio"
                  name="cant-do-reason"
                  value={value}
                  checked={reason === value}
                  autoFocus={index === 0}
                  onChange={() => setReason(value)}
                  className="h-5 w-5 accent-primary"
                />
                {FIELD_ISSUE_REASON_LABELS[value]}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor="cant-do-note" className="text-sm font-semibold text-foreground">
              Note {noteRequired ? '(required)' : '(optional)'}
            </label>
            <textarea
              id="cant-do-note"
              value={note}
              maxLength={NOTE_MAX}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="What happened?"
              aria-describedby={`${sharedHintId}${noteMissing ? ` ${noteHintId}` : ''}`}
              className="min-h-[80px] rounded-card border border-border bg-card p-3 text-sm text-foreground"
            />
            <div className="flex items-center justify-between">
              <p id={sharedHintId} className="text-xs text-muted-foreground">
                This note is shared with the agency.
              </p>
              <span
                className="text-xs text-muted-foreground"
                aria-live={note.length >= 450 ? 'polite' : 'off'}
              >
                {note.length}/{NOTE_MAX}
              </span>
            </div>
            {noteMissing && (
              <p id={noteHintId} className="text-xs font-medium text-destructive">
                Add a short note for this reason
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Operations will be notified and this job will be removed from your route.
          </p>

          {error && (
            <Alert tone="destructive" data-testid="cant-do-error">
              <span>{error}</span>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Button
              variant="danger"
              block
              disabled={!canSend}
              loading={mutation.isPending}
              onClick={handleSend}
              data-testid="cant-do-send"
            >
              {mutation.isPending ? 'Sending…' : 'Send to operations'}
            </Button>
            <Button variant="outlined" block onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
