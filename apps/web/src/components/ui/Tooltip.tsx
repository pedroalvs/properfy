import { useEffect, useId, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Max bubble width; long text wraps instead of running off the screen. */
const MAX_WIDTH = 320;
/** Gap between trigger and bubble. */
const OFFSET = 8;
/** Minimum distance kept from the viewport edges. */
const EDGE = 8;

interface TooltipProps {
  /** Text shown on hover/focus. Newlines are preserved. */
  label: string;
  /** The element the tooltip is anchored to. */
  children: ReactNode;
  /** Optional className on the trigger wrapper. */
  className?: string;
}

/**
 * Hover/focus tooltip for read-only hints (icons that stand in for a value).
 *
 * Rendered through a portal with `position: fixed` — the same reason
 * `SidebarTooltip` does: the callers sit inside `overflow-auto` containers
 * (`DataTable`, the map bulk-action modal) where an absolutely positioned
 * bubble is clipped on the first row.
 *
 * For click-opened menus use `ViewportAwareDropdown` instead; this one is
 * non-interactive by design (`pointer-events-none`) so it can never swallow a
 * row click.
 */
export function Tooltip({ label, children, className = '' }: TooltipProps) {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [bubble, setBubble] = useState<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !anchor || !bubble) {
      setPosition(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    // jsdom and the first paint report 0; assume a two-line bubble so the
    // flip/clamp math still produces a sane position.
    const height = bubble.offsetHeight || 40;
    const width = Math.min(bubble.offsetWidth || MAX_WIDTH, MAX_WIDTH);

    const above = rect.top >= height + OFFSET;
    const top = above ? rect.top - height - OFFSET : rect.bottom + OFFSET;
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(Math.max(centred, EDGE), Math.max(EDGE, window.innerWidth - width - EDGE));

    setPosition({ top, left });
  }, [open, anchor, bubble, label]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    // Coordinates are viewport-fixed, so any scroll/resize leaves them stale.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <span
        ref={setAnchor}
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        className={`inline-flex cursor-help rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <span
            ref={setBubble}
            id={id}
            role="tooltip"
            style={{
              position: 'fixed',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              maxWidth: MAX_WIDTH,
              visibility: position ? 'visible' : 'hidden',
            }}
            className="pointer-events-none z-[70] whitespace-pre-wrap break-words rounded bg-gray-900 px-2 py-1 text-xs font-medium leading-snug text-white shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
