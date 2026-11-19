import { useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useRouteSheetDownload, type SheetFormat } from '../hooks/useRouteSheetDownload';

interface RouteSheetMenuProps {
  date: string;
}

const OPTIONS: Array<{ format: SheetFormat; label: string }> = [
  { format: 'pdf', label: 'PDF' },
  { format: 'xlsx', label: 'Spreadsheet (XLSX)' },
];

/** "Download" button opening a small menu to fetch the route sheet as PDF or XLSX. */
export function RouteSheetMenu({ date }: RouteSheetMenuProps) {
  const { download, pendingFormat, error } = useRouteSheetDownload(date);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outlined"
        className="min-h-touch"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="route-sheet-download"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Download route sheet"
          className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-card border border-border bg-card shadow-lg"
        >
          {OPTIONS.map(({ format, label }) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              disabled={pendingFormat !== null}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm text-foreground hover:bg-muted disabled:opacity-60"
              onClick={() => download(format)}
            >
              {label}
              {pendingFormat === format && (
                <Loader2 className="h-4 w-4 animate-spin" aria-label="Downloading" />
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
