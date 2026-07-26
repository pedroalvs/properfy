/**
 * Shared form input styles.
 * Uses shadow-based borders (same pattern as filter-styles.ts) but with
 * standard top-aligned labels instead of floating labels.
 */

// Container states
export const formInputContainer =
  'relative bg-card-bg rounded shadow-[0_0_0_1px_rgba(0,0,0,0.15)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.4)] focus-within:shadow-[0_0_0_2px_var(--color-primary)] transition-shadow';

export const formInputContainerError =
  'relative bg-card-bg rounded shadow-[0_0_0_2px_var(--color-error)] transition-shadow';

export const formInputContainerDisabled =
  'relative bg-disabled-bg rounded shadow-[0_0_0_1px_rgba(0,0,0,0.1)] cursor-not-allowed';

// Input element
export const formInput =
  'w-full bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none disabled:cursor-not-allowed disabled:text-text-disabled';

// Textarea element
export const formTextarea =
  'w-full bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none resize-y min-h-[80px] disabled:cursor-not-allowed disabled:text-text-disabled';

// Select trigger
export const formSelectTrigger =
  'w-full bg-transparent px-3 py-2 text-sm text-text-primary outline-none cursor-pointer flex items-center justify-between';

// Dropdown
const formDropdownBase =
  'absolute left-0 z-50 max-h-60 w-full overflow-auto overscroll-contain rounded bg-card-bg shadow-lg border border-black/10';

/** Default placement: below the trigger. */
export const formDropdown = `${formDropdownBase} top-full mt-1`;

/** Flipped placement, for a trigger pinned near the bottom of a scrolling
 *  container — see `resolveDropdownPlacement` in `dropdown-placement.ts`. */
export const formDropdownAbove = `${formDropdownBase} bottom-full mb-1`;

export const formOption =
  'cursor-pointer px-3 py-2 text-sm text-text-primary hover:bg-primary/5 transition-colors';

export const formOptionActive =
  'cursor-pointer px-3 py-2 text-sm text-primary bg-primary/10 font-medium';
