import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@properfy/frontend-standards';
import {
  LateNoticeReason,
  LATE_NOTICE_REASON_LABELS,
  LATE_NOTICE_MINUTES_OPTIONS,
} from '@properfy/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/Sheet';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { useReportLateNotice } from '../hooks/useReportLateNotice';
import { captureOptionalLocation } from '../lib/optional-location';
import { fieldEventErrorMessage } from '../lib/field-event-error';

const REASONS = Object.values(LateNoticeReason);

function formatInstantTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

interface LateNoticeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  appointmentCode: string;
  propertyAddress: string;
  /** Booked window start (wall-clock HH:mm) — the fallback reference. */
  timeSlotStart: string;
  /** Published-plan stop start (instant); when present it is the reference instead. */
  publishedServiceStartAt?: string | null;
}

export function LateNoticeSheet({
  open,
  onOpenChange,
  appointmentId,
  appointmentCode,
  propertyAddress,
  timeSlotStart,
  publishedServiceStartAt,
}: LateNoticeSheetProps) {
  const timeZone = useEffectiveTimezone();
  const isOnline = useIsOnline();
  const { showSuccess } = useSnackbar();
  const mutation = useReportLateNotice(appointmentId);
  const [reason, setReason] = useState<LateNoticeReason | null>(null);
  const [minutesLate, setMinutesLate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string>(generateIdempotencyKey());
  const submittingRef = useRef(false);
  const groupId = useId();

  useEffect(() => {
    if (open) {
      setReason(null);
      setMinutesLate(null);
      setError(null);
      idempotencyKey.current = generateIdempotencyKey();
    }
  }, [open]);

  const hasPublishedStop = Boolean(publishedServiceStartAt);
  const referenceTime = hasPublishedStop
    ? formatInstantTime(publishedServiceStartAt!, timeZone)
    : timeSlotStart;
  const referenceHelp = hasPublishedStop
    ? 'Count from your planned arrival time.'
    : 'Count from the start of the booked window.';

  const canSend = isOnline && reason != null && minutesLate != null && !mutation.isPending;

  const handleSend = async () => {
    if (!reason || minutesLate == null || !canSend || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    const position = await captureOptionalLocation();
    try {
      const result = await mutation.mutateAsync({
        body: { reason, minutesLate, ...(position ?? {}) },
        idempotencyKey: idempotencyKey.current,
      });
      onOpenChange(false);
      showSuccess(
        `Operations know you'll arrive around ${formatInstantTime(result.estimatedArrivalAt, timeZone)} (about ${result.minutesLate} min late).`,
      );
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
          <SheetTitle>Running late</SheetTitle>
          <SheetDescription>
            {appointmentCode} · {propertyAddress}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-4 overflow-y-auto">
          {!isOnline && (
            <Alert tone="warning" data-testid="late-notice-offline">
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
                  name="late-notice-reason"
                  value={value}
                  checked={reason === value}
                  autoFocus={index === 0}
                  onChange={() => setReason(value)}
                  className="h-5 w-5 accent-primary"
                />
                {LATE_NOTICE_REASON_LABELS[value]}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-2">
            <p id={groupId} className="text-sm font-semibold text-foreground">
              How late will you arrive? (from {referenceTime})
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={groupId}>
              {LATE_NOTICE_MINUTES_OPTIONS.map((n) => {
                const selected = minutesLate === n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${n} minutes late`}
                    onClick={() => setMinutesLate(n)}
                    className={cn(
                      'min-h-touch rounded-card border px-4 text-sm font-bold',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{referenceHelp}</p>
          </div>

          {error && (
            <Alert tone="destructive" data-testid="late-notice-error">
              <span>{error}</span>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              block
              disabled={!canSend}
              loading={mutation.isPending}
              onClick={handleSend}
              data-testid="late-notice-send"
            >
              {mutation.isPending ? 'Sending…' : 'Notify operations'}
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
