import { useEffect, useId, useRef, type ReactNode } from 'react';
import { lockBodyScroll } from '@/lib/body-scroll-lock';

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

  // Consumers commonly pass a render-time arrow as `onClose`. Reading it through a ref
  // keeps the effect below keyed on `open` alone — otherwise every re-render of the
  // consumer (e.g. a keystroke in a field inside the dialog) re-ran the effect and its
  // `focus()` call, blurring whatever the user was typing into.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // A Dialog is often stacked over a DrawerPanel, which also closes on
        // Escape from its own document listener. Consume the event in the capture
        // phase so only the dialog closes — otherwise Escape dismisses the whole
        // drawer and discards what the operator had typed.
        e.stopImmediatePropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);

    // Focus trap: focus the dialog on open
    dialogRef.current?.focus();

    // Lock the page scroll while the dialog is open so wheel events at the end
    // of the dialog body don't chain to (and scroll) the page behind it.
    // Reference-counted: a dialog stacked over a drawer releases in any order.
    const releaseScrollLock = lockBodyScroll();

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      releaseScrollLock();
    };
  }, [open]);

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
        className="relative z-10 flex max-h-[90vh] flex-col rounded-[var(--radius-modal)] bg-card-bg shadow-xl outline-none"
        style={{ maxWidth, width: '90vw' }}
      >
        {/* Header — always visible */}
        <div className="flex flex-shrink-0 items-center justify-between px-6 pt-5 pb-0">
          <h2 id={titleId} className="text-dialog-title text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
            aria-label="Close"
          >
            <i className="mdi mdi-close text-xl" />
          </button>
        </div>

        {/* Body — scrollable when content overflows */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-2">{children}</div>

        {/* Actions — always visible */}
        {actions && (
          <div className="flex flex-shrink-0 justify-end gap-2 px-6 pb-5 pt-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
