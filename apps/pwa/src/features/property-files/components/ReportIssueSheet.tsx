import { useEffect, useId, useRef, useState } from 'react';
import { PROPERTY_ISSUE_REASON_MAX } from '@properfy/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/Sheet';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { useIssuePhotoUpload } from '../hooks/useIssuePhotoUpload';
import { useCreatePropertyIssue } from '../hooks/useCreatePropertyIssue';
import { propertyFileErrorMessage } from '../lib/property-file-error';
import { PhotoPicker } from './PhotoPicker';

interface ReportIssueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  propertyId: string;
  propertyAddress: string;
}

/**
 * "Report issue" sheet (online-only, D12/D24). A required reason (1–1000) plus
 * optional photos uploaded one at a time via `useIssuePhotoUpload`. The issue is
 * created only once every photo is confirmed (or the failed ones removed), with a
 * stable per-open `Idempotency-Key`. A zero-photo issue is valid (D27). A 503
 * surfaces `FILE_STORAGE_UNAVAILABLE_MESSAGE` (via the error mapper).
 */
export function ReportIssueSheet({
  open,
  onOpenChange,
  appointmentId,
  propertyId,
  propertyAddress,
}: ReportIssueSheetProps) {
  const isOnline = useIsOnline();
  const { showSuccess } = useSnackbar();
  const { photos, addError, addPhoto, retryPhoto, removePhoto, reset, isUploading, hasFailed, confirmedFileIds } =
    useIssuePhotoUpload({ propertyId, appointmentId });
  const mutation = useCreatePropertyIssue(appointmentId);

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string>(generateIdempotencyKey());
  const submittingRef = useRef(false);
  const hintId = useId();

  // Reset (and mint a fresh idempotency key) each time the sheet opens.
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      idempotencyKey.current = generateIdempotencyKey();
      reset();
    }
  }, [open, reset]);

  const reasonTrimmed = reason.trim();
  const reasonValid = reasonTrimmed.length >= 1 && reasonTrimmed.length <= PROPERTY_ISSUE_REASON_MAX;
  const canSubmit = isOnline && reasonValid && !isUploading && !hasFailed && !mutation.isPending;

  const handleSubmit = async () => {
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    try {
      await mutation.mutateAsync({
        body: {
          propertyId,
          appointmentId,
          reason: reasonTrimmed,
          ...(confirmedFileIds.length > 0 ? { photoFileIds: confirmedFileIds } : {}),
        },
        idempotencyKey: idempotencyKey.current,
      });
      onOpenChange(false);
      showSuccess('Issue reported.');
    } catch (err) {
      setError(propertyFileErrorMessage(err));
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Report issue</SheetTitle>
          <SheetDescription>{propertyAddress}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {!isOnline && (
            <Alert tone="warning" data-testid="report-issue-offline">
              <span>You need a connection to report an issue. Try again when you&apos;re back online.</span>
            </Alert>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="report-issue-reason" className="text-sm font-semibold text-foreground">
              Reason
            </label>
            <textarea
              id="report-issue-reason"
              value={reason}
              maxLength={PROPERTY_ISSUE_REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the problem"
              aria-describedby={hintId}
              className="min-h-[90px] rounded-card border border-border bg-card p-3 text-sm text-foreground"
            />
            <div className="flex items-center justify-between">
              <p id={hintId} className="text-xs text-muted-foreground">
                Required.
              </p>
              <span className="text-xs text-muted-foreground">
                {reasonTrimmed.length}/{PROPERTY_ISSUE_REASON_MAX}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">Photos (optional)</span>
            <PhotoPicker
              photos={photos}
              addError={addError}
              onAddFile={addPhoto}
              onRetry={retryPhoto}
              onRemove={removePhoto}
              disabled={!isOnline}
            />
          </div>

          {error && (
            <Alert tone="destructive" data-testid="report-issue-error">
              <span>{error}</span>
            </Alert>
          )}
        </div>

        {/* Pinned footer so the primary action stays reachable on a phone even
            when the scrollable body (reason + photos) overflows. */}
        <div className="mt-3 flex shrink-0 flex-col gap-2 pt-1">
          <Button
            variant="primary"
            block
            disabled={!canSubmit}
            loading={mutation.isPending}
            onClick={handleSubmit}
            data-testid="report-issue-submit"
          >
            {mutation.isPending ? 'Reporting…' : 'Report issue'}
          </Button>
          <Button variant="outlined" block onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
