import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  PropertyFileType,
  PROPERTY_ISSUE_REASON_MAX,
  DEFAULT_PROPERTY_FILES_SETTING,
} from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { DrawerPanel, DrawerHeader, Button } from '@/components/ui';
import { FormField, Textarea } from '@/components/forms';
import { SelectInput } from '@/components/forms/SelectInput';
import { usePropertyFileUpload } from '../hooks/usePropertyFileUpload';
import { useCreatePropertyIssue } from '../hooks/useCreatePropertyIssue';
import { resolveFileErrorMessage } from '../lib/file-errors';
import type { AppointmentRefs } from './FileSubtabList';

export interface CreateIssueDrawerProps {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  /** Appointment context: the issue is linked to this appointment. */
  appointmentId?: string;
  /** Property context: optional appointment-link selector. */
  appointmentRefs?: AppointmentRefs;
  onCreated?: () => void;
}

interface PhotoItem {
  localId: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  fileId?: string;
  error?: string;
}

const PHOTO_ACCEPT = DEFAULT_PROPERTY_FILES_SETTING.issueImageMimes.join(',');
const MAX_PHOTOS = DEFAULT_PROPERTY_FILES_SETTING.maxPhotosPerIssue;

export function CreateIssueDrawer({
  open,
  onClose,
  propertyId,
  appointmentId,
  appointmentRefs,
  onCreated,
}: CreateIssueDrawerProps) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [linkAppointmentId, setLinkAppointmentId] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { uploadOne } = usePropertyFileUpload();
  const { create, isCreating } = useCreatePropertyIssue();

  // Reset when the drawer opens so a prior draft never leaks into a new issue.
  useEffect(() => {
    if (open) {
      setReason('');
      setReasonError(null);
      setLinkAppointmentId('');
      setPhotos([]);
    }
  }, [open]);

  const uploading = photos.some((p) => p.status === 'uploading');
  const hasFailed = photos.some((p) => p.status === 'error');
  const confirmedIds = photos.filter((p) => p.status === 'done' && p.fileId).map((p) => p.fileId!);

  const addPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = '';
    const room = MAX_PHOTOS - photos.length;
    for (const file of selected.slice(0, Math.max(0, room))) {
      const localId = crypto.randomUUID();
      setPhotos((prev) => [...prev, { localId, name: file.name, status: 'uploading' }]);
      try {
        const confirmed = await uploadOne({ file, type: PropertyFileType.ISSUE, propertyId });
        setPhotos((prev) =>
          prev.map((p) => (p.localId === localId ? { ...p, status: 'done', fileId: confirmed.id } : p)),
        );
      } catch (err) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.localId === localId ? { ...p, status: 'error', error: resolveFileErrorMessage(err, 'Upload failed') } : p,
          ),
        );
      }
    }
  };

  const removePhoto = (localId: string) => setPhotos((prev) => prev.filter((p) => p.localId !== localId));

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 1 || trimmed.length > PROPERTY_ISSUE_REASON_MAX) {
      setReasonError(`Enter a reason (1–${PROPERTY_ISSUE_REASON_MAX} characters).`);
      return;
    }
    if (uploading || hasFailed) return;
    const ok = await create({
      propertyId,
      appointmentId: appointmentId ?? (linkAppointmentId || undefined),
      reason: trimmed,
      photoFileIds: confirmedIds,
    });
    if (ok) {
      onCreated?.();
      onClose();
    }
  };

  return (
    <DrawerPanel open={open} onClose={onClose} size="narrow" ariaLabel="Report issue">
      <div className="flex h-full flex-col">
        <DrawerHeader title="Report issue" onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <FormField label="Reason" required error={reasonError ?? undefined} htmlFor="issue-reason">
            <Textarea
              id="issue-reason"
              value={reason}
              onChange={(v) => {
                setReason(v);
                if (reasonError) setReasonError(null);
              }}
              rows={4}
              maxLength={PROPERTY_ISSUE_REASON_MAX}
              placeholder="Describe the problem"
              error={!!reasonError}
            />
          </FormField>

          {appointmentRefs && appointmentRefs.options.length > 0 && (
            <div className="mt-4">
              <span className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Link to appointment (optional)
              </span>
              <SelectInput
                value={linkAppointmentId}
                onChange={setLinkAppointmentId}
                options={[
                  { label: 'No appointment', value: '' },
                  ...appointmentRefs.options.map((o) => ({ label: `#${o.code}`, value: o.id })),
                ]}
                aria-label="Link issue to appointment"
              />
            </div>
          )}

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary">
                Photos ({photos.length}/{MAX_PHOTOS})
              </span>
              <Button
                variant="secondary"
                onClick={() => photoInputRef.current?.click()}
                disabled={photos.length >= MAX_PHOTOS}
              >
                <i className="mdi mdi-camera-plus-outline mr-1" aria-hidden="true" />
                Add photos
              </Button>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={addPhotos}
            />
            <ul className="flex flex-col gap-1.5">
              {photos.map((p) => (
                <li
                  key={p.localId}
                  className="flex items-center justify-between gap-2 rounded border border-border-subtle px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <i
                      className={cn(
                        'mdi shrink-0',
                        p.status === 'uploading' && 'mdi-loading mdi-spin text-text-secondary',
                        p.status === 'done' && 'mdi-check-circle-outline text-success',
                        p.status === 'error' && 'mdi-alert-circle-outline text-error',
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate text-text-primary" title={p.name}>
                      {p.name}
                    </span>
                    {p.status === 'error' && (
                      <span className="shrink-0 text-xs text-error">{p.error}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhoto(p.localId)}
                    aria-label={`Remove ${p.name}`}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
                  >
                    <i className="mdi mdi-close" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {hasFailed && (
              <p className="mt-1 text-xs text-error">Remove the failed photos before submitting.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isCreating}
            disabled={isCreating || uploading || hasFailed || reason.trim().length === 0}
          >
            Submit
          </Button>
        </div>
      </div>
    </DrawerPanel>
  );
}
