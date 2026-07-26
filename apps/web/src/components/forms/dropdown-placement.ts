/**
 * Placement for an absolutely-positioned dropdown that lives inside a
 * scrolling container.
 *
 * `absolute top-full` is clipped by the nearest scrolling ancestor, not by the
 * viewport. A trigger sitting near that ancestor's bottom edge renders its
 * options into the clipped region, so the menu looks empty until the user
 * scrolls — the failure seen for the last row of the bulk-edit dialog.
 */

/**
 * Minimum room below the trigger, in pixels, before flipping is considered.
 * Roughly four 40px options — enough that a downward menu is still useful.
 * The dropdown itself caps at `max-h-60` (240px) and scrolls internally.
 */
export const DROPDOWN_MIN_SPACE = 160;

export interface DropdownGeometry {
  /** Trigger's top edge, viewport coordinates. */
  triggerTop: number;
  /** Trigger's bottom edge, viewport coordinates. */
  triggerBottom: number;
  /** Clipping container's top edge, viewport coordinates. */
  clipTop: number;
  /** Clipping container's bottom edge, viewport coordinates. */
  clipBottom: number;
}

export type DropdownPlacement = 'below' | 'above';

/** Design cap on the menu height (`max-h-60`, 15rem). */
export const DROPDOWN_MAX_HEIGHT = 240;

/** Breathing room between trigger and menu, matching the `mt-1` / `mb-1` gap. */
const GUTTER = 4;

export interface DropdownLayout {
  placement: DropdownPlacement;
  /** Height cap, in pixels, guaranteeing the menu stays inside the clip. */
  maxHeight: number;
}

/**
 * Returns where the dropdown should open and how tall it may be.
 *
 * Biased towards `below`: it only flips when the space below is genuinely
 * cramped AND flipping actually helps, so existing consumers are unchanged.
 *
 * The height cap is what keeps the menu honest. Choosing a side by comparing
 * free space is not enough — a menu flipped above a trigger that has less than
 * a full menu's worth of room above it overflows the container, and in a modal
 * that means the backdrop paints over it and swallows every click. Bounding the
 * height by the space actually available makes the menu scroll internally
 * instead of escaping.
 */
export function resolveDropdownPlacement({
  triggerTop,
  triggerBottom,
  clipTop,
  clipBottom,
}: DropdownGeometry): DropdownLayout {
  const spaceBelow = clipBottom - triggerBottom;
  const spaceAbove = triggerTop - clipTop;
  const placement: DropdownPlacement =
    spaceBelow < DROPDOWN_MIN_SPACE && spaceAbove > spaceBelow ? 'above' : 'below';
  const available = (placement === 'above' ? spaceAbove : spaceBelow) - GUTTER;
  return {
    placement,
    maxHeight: Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT, available)),
  };
}

/**
 * Finds the rectangle that will actually clip the dropdown: the nearest
 * ancestor that scrolls or hides overflow, falling back to the viewport.
 */
export function clippingRect(el: HTMLElement): { top: number; bottom: number } {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') {
      const rect = node.getBoundingClientRect();
      // A zero-height rect means the node is not laid out (jsdom, or a hidden
      // ancestor); keep looking rather than trusting it.
      if (rect.height > 0) return { top: rect.top, bottom: rect.bottom };
    }
    node = node.parentElement;
  }
  return { top: 0, bottom: window.innerHeight };
}
