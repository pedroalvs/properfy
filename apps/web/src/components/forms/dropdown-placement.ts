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

/**
 * Returns where the dropdown should open. Biased towards `below`: it only
 * flips when the space below is genuinely cramped AND flipping actually helps,
 * so the default behaviour of every existing consumer is unchanged.
 */
export function resolveDropdownPlacement({
  triggerTop,
  triggerBottom,
  clipTop,
  clipBottom,
}: DropdownGeometry): DropdownPlacement {
  const spaceBelow = clipBottom - triggerBottom;
  const spaceAbove = triggerTop - clipTop;
  return spaceBelow < DROPDOWN_MIN_SPACE && spaceAbove > spaceBelow ? 'above' : 'below';
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
