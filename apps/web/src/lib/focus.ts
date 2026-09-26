/** Interactive, keyboard-reachable elements, in DOM order. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Move keyboard focus into a modal surface when it opens (WCAG 2.4.3): focus its
 * first focusable descendant, or the surface container itself when it has none —
 * so focus never stays on the trigger behind the overlay. The container must carry
 * `tabIndex={-1}` for the fallback to take.
 */
export function focusFirstFocusable(container: HTMLElement | null): void {
  if (!container) return;
  const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  (first ?? container).focus();
}
