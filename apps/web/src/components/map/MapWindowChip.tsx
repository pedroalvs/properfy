import type { RefObject } from 'react';
import { cn } from '@properfy/frontend-standards';

interface MapWindowChipProps {
  /** Human label for the active window, e.g. `Today + 14 days`. */
  label: string;
  /**
   * AM/OP: the window is a removable default, so the chip carries a ✕ button.
   * CL: the window is fixed, so the chip is a static, non-interactive indicator.
   */
  removable?: boolean;
  /** Fired by the ✕ button (removable only). */
  onRemove?: () => void;
  /**
   * Where focus returns after the chip is removed — the element that would
   * otherwise be orphaned when the ✕ unmounts (e.g. the Date-From input in the
   * panel, or the filter toggle out of the panel). WCAG 2.4.3.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * F00 — the active map period window, shown both inside the filter panel (above
 * the Date Range) and beside the filter toggle while the panel is closed, so the
 * window state is visible either way. One component, two behaviours: AM/OP get a
 * removable chip (the window is their adjustable default); CL gets a static label
 * (the window is enforced and cannot be dismissed).
 */
export function MapWindowChip({
  label,
  removable = false,
  onRemove,
  returnFocusRef,
  className,
}: MapWindowChipProps) {
  const base = cn(
    'inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-card-bg px-3 py-1 text-xs font-medium text-text-secondary',
    className,
  );

  if (!removable) {
    return (
      <span className={base} aria-label={`Date window: ${label}`} data-testid="map-window-chip">
        <i className="mdi mdi-calendar-range text-sm text-primary" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  const handleRemove = () => {
    onRemove?.();
    // Return focus after the ✕ unmounts so keyboard users are not dropped to the
    // document body. Deferred a frame because the button disappears on the same
    // state update that removes the window.
    requestAnimationFrame(() => returnFocusRef?.current?.focus());
  };

  return (
    <span className={base} data-testid="map-window-chip">
      <i className="mdi mdi-calendar-range text-sm text-primary" aria-hidden="true" />
      <span>{label}</span>
      <button
        type="button"
        onClick={handleRemove}
        aria-label="Remove date window"
        className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-text-muted hover:bg-black/5 hover:text-text-primary"
        data-testid="map-window-chip-remove"
      >
        <i className="mdi mdi-close text-xs" aria-hidden="true" />
      </button>
    </span>
  );
}
