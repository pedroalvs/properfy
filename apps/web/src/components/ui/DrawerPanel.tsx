import { useEffect, useRef, type ReactNode } from 'react';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { focusFirstFocusable } from '@/lib/focus';

type DrawerSize = 'narrow' | 'wide';

interface DrawerPanelProps {
  open: boolean;
  onClose: () => void;
  size?: DrawerSize;
  ariaLabel?: string;
  children: ReactNode;
}

const sizeClasses: Record<DrawerSize, string> = {
  narrow: 'w-full sm:w-drawer-narrow',
  wide: 'w-full sm:w-drawer-wide sm:max-w-[95vw]',
};

export function DrawerPanel({ open, onClose, size = 'narrow', ariaLabel, children }: DrawerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A modal dialog stacked inside the drawer (rendered in the panel's
      // children) closes on its own Escape; don't also close the drawer beneath
      // it — that would dismiss the whole drawer and discard the dialog's input.
      if (panelRef.current?.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      // Own the Escape so it closes the drawer without also reaching a
      // page-level handler behind it.
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Move focus into the drawer on open (WCAG 2.4.3): the first focusable control,
  // or the panel itself (tabIndex={-1}) when it has none — so focus never stays on
  // the trigger behind the overlay. The children stay mounted while closed, so
  // this only fires on the open transition.
  useEffect(() => {
    if (!open) return;
    focusFirstFocusable(panelRef.current);
  }, [open]);

  // Lock the page scroll while the drawer is open — without this, reaching the
  // end of the drawer's own scroll area chains the wheel to the document and
  // the page behind visibly moves. Reference-counted so stacked overlays
  // (dialog above drawer) release in any order without unlocking early.
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`fixed right-0 top-0 z-50 h-screen bg-card-bg shadow-xl outline-none transition-transform duration-300 ${
          sizeClasses[size]
        } ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal={open}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </>
  );
}
