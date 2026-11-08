import { useRef } from 'react';
import { Camera, Check, Loader2, RotateCcw, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { ISSUE_PHOTO_ACCEPT, MAX_ISSUE_PHOTOS } from '../lib/issue-photo-validation';
import type { LocalPhoto } from '../hooks/useIssuePhotoUpload';

interface PhotoPickerProps {
  photos: LocalPhoto[];
  addError: string | null;
  onAddFile: (file: File) => void;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
  disabled?: boolean;
}

/**
 * Presentational per-photo picker, shared by the Report-issue and Can't-do
 * sheets. The parent owns the upload state machine (`useIssuePhotoUpload`) so it
 * can gate submit on `isUploading`/`hasFailed`; this component only renders rows
 * (progress / done / failed-with-retry) and the add/remove controls. No
 * `capture` attribute, so the OS offers camera *and* gallery.
 */
export function PhotoPicker({ photos, addError, onAddFile, onRetry, onRemove, disabled }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const atCap = photos.length >= MAX_ISSUE_PHOTOS;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ISSUE_PHOTO_ACCEPT}
        className="hidden"
        aria-label="Add photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAddFile(file);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || atCap}
        data-testid="add-photo-button"
        className="flex min-h-touch items-center justify-center gap-2 rounded-card border border-dashed border-border bg-card p-3 text-sm font-semibold text-foreground disabled:opacity-50"
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        Add photo
      </button>

      {addError && (
        <Alert tone="warning" data-testid="photo-add-error">
          <span>{addError}</span>
        </Alert>
      )}

      {photos.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="photo-list">
          {photos.map((photo) => (
            <li
              key={photo.localId}
              data-testid={`photo-row-${photo.localId}`}
              data-status={photo.status}
              className="flex items-center gap-3 rounded-card border border-border bg-card p-2"
            >
              <span className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                {photo.previewUrl && (
                  <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{photo.file.name}</span>

              {photo.status === 'uploading' && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Uploading" />
              )}
              {photo.status === 'confirmed' && (
                <Check className="h-5 w-5 text-success" aria-label="Uploaded" />
              )}
              {photo.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => onRetry(photo.localId)}
                  data-testid={`photo-retry-${photo.localId}`}
                  className="flex min-h-touch items-center gap-1 text-sm font-semibold text-destructive"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </button>
              )}

              <button
                type="button"
                onClick={() => onRemove(photo.localId)}
                aria-label={`Remove ${photo.file.name}`}
                data-testid={`photo-remove-${photo.localId}`}
                className="flex min-h-touch min-w-touch items-center justify-center text-muted-foreground"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {photos.some((p) => p.status === 'failed') && (
        <p className="text-xs text-destructive" data-testid="photo-failed-hint">
          A photo failed to upload. Retry or remove it to continue.
        </p>
      )}
    </div>
  );
}
