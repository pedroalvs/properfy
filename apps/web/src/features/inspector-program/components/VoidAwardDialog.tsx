import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/forms/FormField';
import { Textarea } from '@/components/forms/Textarea';
import { Button } from '@/components/ui/Button';

const REASON_MIN = 5;
const REASON_MAX = 500;
const NOTE_MAX = 200;

export interface VoidAwardPayload {
  reason: string;
  inspectorNote?: string;
}

export interface VoidAwardDialogProps {
  open: boolean;
  inspectorName?: string;
  /** The award is already on an invoice: voiding adds a reversal to the next one. */
  invoiced?: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (payload: VoidAwardPayload) => void;
}

/**
 * Void-reward dialog (US2, L-F08-05). Collects a required internal reason (5–500,
 * matching the route's floor — A9) and an optional note shown to the inspector
 * (≤ 200). No "Recovery note" (Q12). Only used for PENDING/APPROVED awards.
 */
export function VoidAwardDialog({ open, inspectorName, invoiced, isSubmitting, onClose, onConfirm }: VoidAwardDialogProps) {
  const [reason, setReason] = useState('');
  const [inspectorNote, setInspectorNote] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setInspectorNote('');
      setTouched(false);
    }
  }, [open]);

  const reasonLength = reason.trim().length;
  const reasonError =
    touched && reasonLength > 0 && reasonLength < REASON_MIN ? `Enter at least ${REASON_MIN} characters.` : undefined;
  const canSubmit = reasonLength >= REASON_MIN && reasonLength <= REASON_MAX && !isSubmitting;

  const submit = () => {
    setTouched(true);
    if (reasonLength < REASON_MIN) return;
    onConfirm({ reason: reason.trim(), inspectorNote: inspectorNote.trim() || undefined });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Void reward">
      <div className="flex flex-col gap-4">
        {inspectorName && (
          <p className="text-sm text-text-secondary">
            This voids {inspectorName}&apos;s reward. It won&apos;t be paid.
          </p>
        )}

        {invoiced && (
          <p role="note" className="rounded bg-black/5 p-3 text-sm text-text-primary">
            This bonus is already on an invoice. Voiding it adds a reversal to the inspector&apos;s next invoice.
          </p>
        )}

        <FormField
          label="Internal reason"
          htmlFor="void-reason"
          error={reasonError}
          hint="Only the Properfy team sees this."
        >
          <Textarea
            id="void-reason"
            value={reason}
            onChange={setReason}
            rows={3}
            maxLength={REASON_MAX}
            error={Boolean(reasonError)}
            aria-label="Internal reason"
            aria-invalid={Boolean(reasonError)}
          />
        </FormField>

        <FormField
          label="Note to the inspector (optional)"
          htmlFor="void-inspector-note"
          hint="Shown in the inspector's app."
        >
          <Textarea
            id="void-inspector-note"
            value={inspectorNote}
            onChange={setInspectorNote}
            rows={2}
            maxLength={NOTE_MAX}
            aria-label="Note to the inspector (optional)"
          />
        </FormField>

        <div className="flex justify-end gap-2">
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="delete" onClick={submit} loading={isSubmitting} disabled={!canSubmit}>
            Void reward
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
