/**
 * Shared frontend constants. Replace scattered magic literals (3000 / 1500 / z-[150])
 * with these named values so timing, stacking and touch sizing are consistent and auditable.
 */

/** Timing values in milliseconds. */
export const TIMING = {
  /** Auto-dismiss for success/info toasts. */
  toastDismiss: 3000,
  /** Transient inline flash (e.g. "Copied", "Saved"). */
  flashMessage: 1500,
  /** Debounce for search/filter inputs. */
  debounceInput: 300,
} as const;

/** z-index scale. Layers compose predictably; never reach for an arbitrary `z-[n]`. */
export const Z_INDEX = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  overlay: 100,
  modal: 110,
  toast: 150,
} as const;

/** Minimum interactive target size (px) — WCAG 2.5.5 / mobile touch guidance. */
export const TOUCH_TARGET_PX = 44;
