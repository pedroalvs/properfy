import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FILE_STORAGE_UNAVAILABLE_MESSAGE,
  PORTAL_MAX_PHOTOS_PER_ISSUE,
  PROPERTY_ISSUE_REASON_MAX,
  createIdempotencyKeyManager,
  generateIdempotencyKey,
} from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import {
  usePortalIssues,
  useCreatePortalReport,
  uploadPortalIssuePhoto,
  type PortalIssue,
} from '../hooks/usePortalIssues';

interface PhotoItem {
  localId: string;
  name: string;
  status: 'uploading' | 'confirmed' | 'error';
  fileId?: string;
  errorMessage?: string;
}

interface Props {
  token: string;
  /** Writes are refused for a read-only (expired/superseded) token (FR-014). */
  disabled: boolean;
}

function toStorageAwareMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 503) return FILE_STORAGE_UNAVAILABLE_MESSAGE;
  if (err instanceof ApiError && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

export function PortalReportProblemSection({ token, disabled }: Props) {
  // The read-only list of the tenant's own submitted reports (always visible).
  const issuesQuery = usePortalIssues(token, true);
  const createReport = useCreatePortalReport(token);

  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Stable create key across retries, rotated after a successful submit (D24).
  const createKey = useRef(createIdempotencyKeyManager());

  const updatePhoto = useCallback((localId: string, patch: Partial<PhotoItem>) => {
    setPhotos((prev) => prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p)));
  }, []);

  const handleAddFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setSubmitError(null);
      setSubmitted(false);

      const remaining = PORTAL_MAX_PHOTOS_PER_ISSUE - photos.length;
      const toUpload = Array.from(fileList).slice(0, Math.max(0, remaining));

      // One photo at a time: a failure keeps the already-confirmed ones (D12).
      for (const file of toUpload) {
        const localId = generateIdempotencyKey();
        setPhotos((prev) => [...prev, { localId, name: file.name, status: 'uploading' }]);
        try {
          const fileId = await uploadPortalIssuePhoto(token, file, generateIdempotencyKey());
          updatePhoto(localId, { status: 'confirmed', fileId });
        } catch (err) {
          updatePhoto(localId, { status: 'error', errorMessage: toStorageAwareMessage(err) });
        }
      }
    },
    [photos.length, token, updatePhoto],
  );

  const removePhoto = useCallback((localId: string) => {
    setPhotos((prev) => prev.filter((p) => p.localId !== localId));
  }, []);

  const confirmedFileIds = useMemo(
    () => photos.filter((p) => p.status === 'confirmed' && p.fileId).map((p) => p.fileId as string),
    [photos],
  );
  const anyUploading = photos.some((p) => p.status === 'uploading');
  const trimmedReason = reason.trim();
  const canSubmit =
    !disabled && trimmedReason.length > 0 && !anyUploading && !createReport.isPending;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    try {
      await createReport.mutateAsync({
        reason: trimmedReason,
        photoFileIds: confirmedFileIds,
        idempotencyKey: createKey.current.current(),
      });
      createKey.current.rotate();
      setReason('');
      setPhotos([]);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(toStorageAwareMessage(err));
    }
  }, [canSubmit, confirmedFileIds, createReport, trimmedReason]);

  const issues = issuesQuery.data?.issues ?? [];

  return (
    <section
      className="rounded-xl border border-border-subtle bg-card-bg p-6"
      aria-labelledby="portal-report-problem-heading"
    >
      <h2 id="portal-report-problem-heading" className="text-base font-bold text-secondary">
        Report a problem with the property
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Noticed something that needs attention? Let us know before the inspection. This is
        separate from confirming your appointment.
      </p>

      {!disabled && (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="portal-issue-reason" className="block text-sm font-semibold text-text-primary">
              Describe the issue
            </label>
            <textarea
              id="portal-issue-reason"
              value={reason}
              maxLength={PROPERTY_ISSUE_REASON_MAX}
              onChange={(e) => {
                setReason(e.target.value);
                setSubmitted(false);
              }}
              rows={4}
              className="mt-1 w-full rounded border border-border-subtle p-3 text-sm focus:border-primary focus:outline-none"
              placeholder="e.g. The front gate will not lock."
            />
            <div className="mt-1 text-right text-xs text-text-muted">
              {reason.length}/{PROPERTY_ISSUE_REASON_MAX}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">Add photos (optional)</span>
              <span className="text-xs text-text-muted">
                {photos.length}/{PORTAL_MAX_PHOTOS_PER_ISSUE}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label="Add photos"
              onChange={(e) => {
                void handleAddFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photos.length >= PORTAL_MAX_PHOTOS_PER_ISSUE}
              className="mt-2 inline-flex items-center gap-2 rounded border border-border-subtle px-3 py-2 text-sm font-semibold text-secondary disabled:opacity-50"
            >
              <i className="mdi mdi-camera-plus-outline" aria-hidden="true" />
              Add photos
            </button>

            {photos.length > 0 && (
              <ul className="mt-3 space-y-2">
                {photos.map((photo) => (
                  <li
                    key={photo.localId}
                    className="flex items-center justify-between gap-3 rounded border border-border-subtle px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{photo.name}</span>
                    {photo.status === 'uploading' && (
                      <span className="text-xs text-text-muted">Uploading…</span>
                    )}
                    {photo.status === 'confirmed' && (
                      <span className="text-xs text-success">
                        <i className="mdi mdi-check-circle" aria-hidden="true" /> Ready
                      </span>
                    )}
                    {photo.status === 'error' && (
                      <span className="text-xs text-error">{photo.errorMessage}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.localId)}
                      aria-label={`Remove ${photo.name}`}
                      className="text-text-muted hover:text-error"
                    >
                      <i className="mdi mdi-close" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {submitError && <p className="text-sm text-error">{submitError}</p>}
          {submitted && (
            <p className="text-sm text-success" role="status">
              Thanks — your report has been sent to the team.
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center rounded bg-real-estate px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {createReport.isPending ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      )}

      {issues.length > 0 && (
        <div className="mt-6 border-t border-border-subtle pt-4">
          <h3 className="text-sm font-bold text-text-primary">Your reports</h3>
          <ul className="mt-2 space-y-3">
            {issues.map((issue: PortalIssue) => (
              <li key={issue.id} className="rounded border border-border-subtle p-3">
                <p className="whitespace-pre-wrap text-sm text-text-primary">{issue.reason}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {issue.photos.length > 0
                    ? `${issue.photos.length} photo${issue.photos.length > 1 ? 's' : ''} attached`
                    : 'No photos'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
