/**
 * Reference-counted page scroll lock shared by every overlay (Dialog,
 * DrawerPanel). Per-instance save/restore breaks with stacked overlays: if the
 * one that captured the original overflow value closes first, it re-enables
 * scrolling while another overlay is still open. The counter restores the
 * original value only when the last lock is released.
 */
let lockCount = 0;
let previousOverflow = '';

/** Acquires the lock; returns an idempotent release function. */
export function lockBodyScroll(): () => void {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount -= 1;
    if (lockCount === 0) {
      document.body.style.overflow = previousOverflow;
    }
  };
}
