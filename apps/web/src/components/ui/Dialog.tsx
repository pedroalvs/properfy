import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  maxWidth?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  maxWidth = '500px',
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    // Focus trap: focus the dialog on open
    dialogRef.current?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Content */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-10 rounded-[var(--radius-modal)] bg-card-bg shadow-xl outline-none"
        style={{ maxWidth, width: '90vw' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <h2 id={titleId} className="text-dialog-title text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
            aria-label="Close"
          >
            <i className="mdi mdi-close text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pt-4 pb-2">{children}</div>

        {/* Actions */}
        {actions && (
          <div className="flex justify-end gap-2 px-6 pb-5 pt-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
