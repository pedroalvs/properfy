import type { PropertyFileResponse } from '@properfy/shared';
import { formatInstantDateTime } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { DrawerPanel, DrawerHeader, Button } from '@/components/ui';
import { humanizeSize } from '../lib/file-type';

export interface FileVersionsDrawerProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  /** All versions of the group, newest first. */
  versions: PropertyFileResponse[];
  onOpen: (fileId: string) => void;
  openingId?: string | null;
  /** US2: upload a new version (AM/OP/CL_ADMIN). */
  onNewVersion?: () => void;
}

/**
 * Lists every version of a file group (F10 C.6/C.A3). The previous version stays
 * downloadable — each row opens a fresh signed URL in a new tab.
 */
export function FileVersionsDrawer({
  open,
  onClose,
  fileName,
  versions,
  onOpen,
  openingId,
  onNewVersion,
}: FileVersionsDrawerProps) {
  return (
    <DrawerPanel open={open} onClose={onClose} size="narrow" ariaLabel="File versions">
      <div className="flex h-full flex-col">
        <DrawerHeader
          title="Versions"
          onClose={onClose}
          actions={
            onNewVersion ? (
              <Button variant="secondary" onClick={onNewVersion}>
                <i className="mdi mdi-upload mr-1" aria-hidden="true" />
                New version
              </Button>
            ) : undefined
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-3 truncate text-sm text-text-secondary" title={fileName}>
            {fileName}
          </p>
          <ul className="flex flex-col gap-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded border border-border-subtle p-3"
              >
                <div>
                  <span className="text-sm font-semibold text-text-primary">v{v.version}</span>
                  <div className="text-xs text-text-secondary">
                    {formatInstantDateTime(v.createdAt)} · {humanizeSize(v.sizeBytes)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(v.id)}
                  disabled={openingId === v.id}
                  aria-label={`Open version ${v.version}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5 disabled:opacity-40"
                >
                  <i
                    className={cn('mdi', openingId === v.id ? 'mdi-loading mdi-spin' : 'mdi-open-in-new')}
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DrawerPanel>
  );
}
