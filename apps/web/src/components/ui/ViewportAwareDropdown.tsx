import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type DropdownPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

interface ViewportAwareDropdownProps {
  /** The toggle element. Receives `aria-expanded` + `aria-haspopup` via cloned props. */
  trigger: ReactNode;
  /** Dropdown body. Rendered absolutely-positioned next to the trigger when open. */
  children: ReactNode;
  /**
   * Preferred placement. `'auto'` (default) picks the side with the most
   * available space around the trigger; the explicit placements skip the
   * measurement and pin the dropdown to that side.
   */
  placement?: DropdownPlacement;
  /** Optional gap between trigger and menu (default 4px). */
  offset?: number;
  /** Optional menu min-width (default 200px). */
  menuMinWidth?: number;
  /** Optional className on the OUTER wrapper. */
  className?: string;
  /**
   * When true the menu is rendered into `document.body` via a portal with
   * `position: fixed` coords computed from the trigger's viewport rect.
   * Use this when the dropdown sits inside an overflow:hidden container
   * (e.g. a fixed modal panel) where `position: absolute` would clip.
   */
  renderInPortal?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
  /** When true the coords are viewport-fixed (for portal mode). */
  fixed?: boolean;
}

/**
 * 026 §FR-501 — generic dropdown primitive that auto-flips per viewport
 * edges so menus near the right/bottom of the screen don't clip.
 *
 * - Renders `trigger` inline; the menu is a SIBLING `position: absolute`
 *   div anchored to the trigger's rect.
 * - On open: measures the trigger via `getBoundingClientRect()` and
 *   picks the placement with the most room (or honours the explicit prop).
 * - Re-measures on window resize.
 * - Closes on outside click + on Escape.
 *
 * No new dependency — vanilla React + DOM measurements. ~80 lines.
 */
export function ViewportAwareDropdown({
  trigger,
  children,
  placement = 'auto',
  offset = 4,
  menuMinWidth = 200,
  className = '',
  renderInPortal = false,
}: ViewportAwareDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const computePosition = useCallback((): MenuPosition | null => {
    const trig = triggerRef.current;
    if (!trig) return null;
    const rect = trig.getBoundingClientRect();
    // jsdom + first-paint return offsetHeight=0; use a conservative
    // default so the flip math still works before the menu has rendered.
    const measuredHeight = menuRef.current?.offsetHeight ?? 0;
    const menuHeight = measuredHeight > 0 ? measuredHeight : 240;
    const menuWidth = Math.max(menuRef.current?.offsetWidth ?? 0, menuMinWidth);
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Available room on each side of the trigger.
    const roomBottom = vh - rect.bottom;
    const roomTop = rect.top;
    const roomRight = vw - rect.right;
    const roomLeft = rect.left;

    // Decide actual placement.
    let actual: 'top' | 'bottom' | 'left' | 'right';
    if (placement !== 'auto') {
      actual = placement;
    } else {
      // Prefer bottom (default native dropdown behaviour) unless it
      // doesn't fit; then top; then right; then left.
      if (roomBottom >= menuHeight) actual = 'bottom';
      else if (roomTop >= menuHeight) actual = 'top';
      else if (roomRight >= menuWidth) actual = 'right';
      else if (roomLeft >= menuWidth) actual = 'left';
      else actual = 'bottom'; // best-effort fallback when no side fits cleanly
    }

    if (renderInPortal) {
      // Portal mode: coords are viewport-fixed so the menu escapes overflow:hidden parents.
      let top = 0;
      let left = rect.left;
      switch (actual) {
        case 'bottom': top = rect.bottom + offset; break;
        case 'top':    top = rect.top - menuHeight - offset; break;
        case 'right':  top = rect.top; left = rect.right + offset; break;
        case 'left':   top = rect.top; left = rect.left - menuWidth - offset; break;
      }
      // Clamp to viewport
      if (actual === 'top' || actual === 'bottom') {
        if (left + menuWidth > vw - 8) left = vw - 8 - menuWidth;
        if (left < 8) left = 8;
      }
      return { top, left, placement: actual, fixed: true };
    }

    // Non-portal mode: coords relative to the trigger wrapper (position: relative).
    let top = 0;
    let left = 0;
    switch (actual) {
      case 'bottom':
        top = rect.height + offset;
        left = 0;
        break;
      case 'top':
        top = -(menuHeight + offset);
        left = 0;
        break;
      case 'right':
        top = 0;
        left = rect.width + offset;
        break;
      case 'left':
        top = 0;
        left = -(menuWidth + offset);
        break;
    }

    // Clamp horizontally so the menu never exceeds the viewport.
    if (actual === 'top' || actual === 'bottom') {
      const absoluteLeft = rect.left + left;
      if (absoluteLeft + menuWidth > vw - 8) {
        left -= (absoluteLeft + menuWidth) - (vw - 8);
      }
      if (rect.left + left < 8) {
        left = 8 - rect.left;
      }
    }

    return { top, left, placement: actual };
  }, [placement, offset, menuMinWidth, renderInPortal]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }
    setMenuPosition(computePosition());
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => setMenuPosition(computePosition());
    const handleScroll = () => setMenuPosition(computePosition());
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!triggerRef.current || !menuRef.current) return;
      const target = e.target as Node | null;
      if (target && (triggerRef.current.contains(target) || menuRef.current.contains(target))) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const menuNode = open ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      className="rounded border border-border-subtle bg-card-bg shadow-lg"
      style={{
        position: menuPosition?.fixed ? 'fixed' : 'absolute',
        zIndex: 50,
        top: menuPosition?.top ?? 0,
        left: menuPosition?.left ?? 0,
        minWidth: menuMinWidth,
        visibility: menuPosition ? 'visible' : 'hidden',
      }}
      data-placement={menuPosition?.placement ?? 'bottom'}
      data-testid="viewport-aware-dropdown-menu"
    >
      {children}
    </div>
  ) : null;

  return (
    <div className={`relative inline-block ${className}`} data-testid="viewport-aware-dropdown">
      <div
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
      >
        {trigger}
      </div>
      {renderInPortal && open
        ? createPortal(menuNode, document.body)
        : menuNode}
    </div>
  );
}
