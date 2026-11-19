import type { PropertyFileResponse } from '@properfy/shared';
import { formatInstantDate } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { humanizeSize, isImageMime, isPdfMime } from '../lib/file-type';

export interface PropertyFileCardProps {
  file: PropertyFileResponse;
  /** Property context: resolved appointment code for `file.appointmentId` (null if unresolved). */
  appointmentCode?: string | null;
  onOpenAppointment?: (appointmentId: string) => void;
  /** Open/download the file (fresh signed URL → new tab). */
  onOpen: (fileId: string) => void;
  opening?: boolean;
  /** US2: add a new version (AM/OP/CL_ADMIN). */
  onNewVersion?: () => void;
  /** US2: open the Versions drawer (shown when the group has history). */
  onViewVersions?: () => void;
  /** US2: soft-delete (AM/OP). */
  onDelete?: () => void;
}

function fileIcon(mime: string): string {
  if (isImageMime(mime)) return 'mdi-file-image-outline';
  if (isPdfMime(mime)) return 'mdi-file-pdf-box';
  return 'mdi-file-document-outline';
}

export function PropertyFileCard({
  file,
  appointmentCode,
  onOpenAppointment,
  onOpen,
  opening,
  onNewVersion,
  onViewVersions,
  onDelete,
}: PropertyFileCardProps) {
  return (
    <div className="flex items-start gap-3 rounded border border-border-subtle bg-card-bg p-3">
      <i
        className={cn('mdi text-2xl text-text-secondary', fileIcon(file.mime))}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-text-primary" title={file.fileName}>
            {file.fileName}
          </span>
          {file.version > 1 && (
            <span className="shrink-0 rounded bg-info/10 px-1.5 py-0.5 text-xs font-semibold text-info">
              v{file.version}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-text-secondary">
          {formatInstantDate(file.createdAt)} · {humanizeSize(file.sizeBytes)}
        </div>
        {file.appointmentId && onOpenAppointment && (
          <button
            type="button"
            onClick={() => onOpenAppointment(file.appointmentId!)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <i className="mdi mdi-calendar-outline" aria-hidden="true" />
            {appointmentCode ? `Appointment #${appointmentCode}` : 'Open appointment'}
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onOpen(file.id)}
          disabled={opening}
          aria-label={`Open ${file.fileName}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5 disabled:opacity-40"
        >
          <i className={cn('mdi', opening ? 'mdi-loading mdi-spin' : 'mdi-open-in-new')} aria-hidden="true" />
        </button>
        {onViewVersions && (
          <button
            type="button"
            onClick={onViewVersions}
            aria-label={`Versions of ${file.fileName}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
          >
            <i className="mdi mdi-history" aria-hidden="true" />
          </button>
        )}
        {onNewVersion && (
          <button
            type="button"
            onClick={onNewVersion}
            aria-label={`New version of ${file.fileName}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
          >
            <i className="mdi mdi-file-replace-outline" aria-hidden="true" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${file.fileName}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-error hover:bg-error/10"
          >
            <i className="mdi mdi-delete-outline" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
