import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn, Z_INDEX } from '@properfy/frontend-standards';

export interface SpotlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CoachOverlayProps {
  /** The highlighted rect (target + padding); `null` dims the whole screen. */
  spotlight: SpotlightRect | null;
  /** Animate the spotlight (disabled under reduced motion). */
  animate: boolean;
  /** The anchored balloon; omitted while a target is still resolving. */
  children?: ReactNode;
}

/**
 * The sanctioned full-screen coach-mark overlay primitive (design-system layer).
 * A Radix Dialog/Sheet cannot cut a spotlight into a target nor anchor a popover to
 * it, so the tour (F04-3b) composes this instead. The dimming comes from a large
 * `box-shadow` on the spotlight (cheap repaint on iOS; no `clip-path`), and the
 * transparent overlay below the balloon captures clicks so the highlighted element
 * is never interactive during the tour.
 */
export function CoachOverlay({ spotlight, animate, children }: CoachOverlayProps) {
  const transition = animate ? 'transition-all duration-200' : '';
  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: Z_INDEX.modal }}>
      <div data-testid="tour-overlay" className="absolute inset-0" aria-hidden="true" />
      {spotlight ? (
        <div
          data-testid="tour-spotlight"
          className={cn('pointer-events-none absolute rounded-[12px]', transition)}
          style={{
            left: spotlight.x,
            top: spotlight.y,
            width: spotlight.w,
            height: spotlight.h,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      )}
      {children}
    </div>,
    document.body,
  );
}
