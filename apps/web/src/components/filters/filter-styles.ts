/**
 * Shared filter styles replicating legacy Vuetify outlined+dense inputs.
 * Uses shadow-based borders instead of standard CSS borders.
 */

export const filterContainer =
  'relative bg-card-bg rounded shadow-[0_0_0_1px_rgba(0,0,0,0.15)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.4)] focus-within:shadow-[0_0_0_2px_var(--color-primary)] transition-shadow';

export const filterInput =
  'w-full bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none';

export const filterLabel =
  'absolute -top-2.5 left-2.5 bg-card-bg px-1 text-xs text-text-secondary pointer-events-none';

export const filterLabelFocused =
  'absolute -top-2.5 left-2.5 bg-card-bg px-1 text-xs text-primary pointer-events-none';

export const filterIcon = 'text-text-muted text-lg';

export const filterDropdown =
  'absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded bg-card-bg shadow-lg border border-black/10';

export const filterOption =
  'cursor-pointer px-3 py-2 text-sm text-text-primary hover:bg-primary/5 transition-colors';

export const filterOptionActive =
  'cursor-pointer px-3 py-2 text-sm text-primary bg-primary/10 font-medium';
