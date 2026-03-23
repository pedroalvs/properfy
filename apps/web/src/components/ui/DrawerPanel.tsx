import { useEffect, type ReactNode } from 'react';

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
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

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
        className={`fixed right-0 top-0 z-50 h-screen bg-card-bg shadow-xl transition-transform duration-300 ${
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
