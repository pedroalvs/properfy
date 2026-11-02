/**
 * Minimal focus trap for the tour balloon. The balloon is `role="dialog"
 * aria-modal="true"`; while it is open, Tab/Shift+Tab must cycle within it. Kept
 * tiny and dependency-free (Radix Dialog is unsuitable — see research D1).
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Visible, focusable descendants of `container`, in DOM order. */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Handle a `keydown` for the trap. On Tab at the last element, wrap to the first;
 * on Shift+Tab at the first, wrap to the last. Returns `true` when it handled the
 * event (caller should treat it as consumed).
 */
export function handleFocusTrapKeyDown(container: HTMLElement, event: KeyboardEvent): boolean {
  if (event.key !== 'Tab') return false;
  const focusable = getFocusable(container);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return true;
  }
  const active = (container.ownerDocument.activeElement as HTMLElement | null) ?? null;

  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
      return true;
    }
    return false;
  }
  if (active === last || !container.contains(active)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
