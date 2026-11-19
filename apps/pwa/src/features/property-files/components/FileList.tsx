import { FileText, Image as ImageIcon, File, Download, Loader2 } from 'lucide-react';
import type { PropertyFileResponse } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/feedback/EmptyState';
import { previewKind } from '../lib/property-file-view';
import { useFileDownload } from '../hooks/useFileDownload';

function FileIcon({ mime }: { mime: string }) {
  const kind = previewKind(mime);
  if (kind === 'image') return <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
  if (kind === 'pdf') return <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
  return <File className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
}

interface FileListProps {
  files: PropertyFileResponse[];
  emptyLabel: string;
}

/**
 * Read-only list of Document/Report/Other files: name + a tappable "Open"
 * affordance that fetches a 5-min signed URL and opens it (the browser previews
 * an image/PDF, downloads anything else — C.4). The inspector cannot upload,
 * version or delete here.
 */
export function FileList({ files, emptyLabel }: FileListProps) {
  const { openFile, pendingId, error } = useFileDownload();

  if (files.length === 0) {
    return <EmptyState title={emptyLabel} icon={File} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Alert tone="destructive" data-testid="file-download-error">
          <span>{error}</span>
        </Alert>
      )}
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => openFile(file.id)}
          disabled={pendingId === file.id}
          data-testid={`file-row-${file.id}`}
          className={cn(
            'flex min-h-touch items-center gap-3 rounded-card border border-border bg-card p-3 text-left',
            'disabled:opacity-60',
          )}
        >
          <FileIcon mime={file.mime} />
          <span className="min-w-0 flex-1 break-words text-sm font-medium text-foreground">
            {file.fileName}
          </span>
          {pendingId === file.id ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <Download className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          )}
          <span className="sr-only">Open {file.fileName}</span>
        </button>
      ))}
    </div>
  );
}
