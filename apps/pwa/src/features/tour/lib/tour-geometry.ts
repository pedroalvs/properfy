/**
 * Pure geometry for the app tour: given a target rect (or none), the viewport and
 * the safe-area insets, compute the spotlight cut-out and the balloon position.
 * No DOM access — the component measures with `getBoundingClientRect` and passes
 * the plain numbers in, so this is fully unit-testable in jsdom.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TourGeometryInput {
  /** The target's viewport rect, or `null` for a centered (install) step. */
  targetRect: Rect | null;
  viewport: { width: number; height: number };
  insets: { safeTop: number; safeBottom: number };
  /** Spotlight padding around the target (default 8). */
  padding?: number;
  /** Minimum gap from the viewport edges and the insets (default 16). */
  gutter?: number;
  /** Measured balloon size; a sensible default keeps placement deterministic. */
  balloon?: { width: number; height: number };
  /** Gap between the spotlight and the balloon (default 12). */
  gap?: number;
}

export interface TourGeometry {
  /** The highlighted rect (target + padding), or `null` for a centered step. */
  spotlight: Rect | null;
  placement: 'top' | 'bottom' | 'center';
  balloon: { left: number; top: number };
  isTargetVisible: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function computeTourGeometry(input: TourGeometryInput): TourGeometry {
  const { targetRect, viewport, insets } = input;
  const padding = input.padding ?? 8;
  const gutter = input.gutter ?? 16;
  const gap = input.gap ?? 12;
  const balloonWidth = input.balloon?.width ?? Math.min(320, viewport.width - gutter * 2);
  const balloonHeight = input.balloon?.height ?? 160;

  const minLeft = gutter;
  const maxLeft = viewport.width - gutter - balloonWidth;
  const minTop = insets.safeTop + gutter;
  const maxTop = viewport.height - insets.safeBottom - gutter - balloonHeight;

  // Centered step (install / no target): dark overlay, balloon centered, no spotlight.
  if (!targetRect) {
    return {
      spotlight: null,
      placement: 'center',
      balloon: {
        left: clamp((viewport.width - balloonWidth) / 2, minLeft, maxLeft),
        top: clamp((viewport.height - balloonHeight) / 2, minTop, maxTop),
      },
      isTargetVisible: false,
    };
  }

  const spotlight: Rect = {
    x: targetRect.x - padding,
    y: targetRect.y - padding,
    w: targetRect.w + padding * 2,
    h: targetRect.h + padding * 2,
  };

  const isTargetVisible =
    targetRect.w > 0 &&
    targetRect.h > 0 &&
    targetRect.y + targetRect.h > 0 &&
    targetRect.y < viewport.height;

  // Below when the target sits in the top half; above otherwise.
  const targetCenterY = targetRect.y + targetRect.h / 2;
  const placement: 'top' | 'bottom' = targetCenterY < viewport.height / 2 ? 'bottom' : 'top';

  const rawTop =
    placement === 'bottom' ? spotlight.y + spotlight.h + gap : spotlight.y - gap - balloonHeight;
  // Anchor the balloon horizontally on the target center, then clamp to gutters.
  const rawLeft = targetRect.x + targetRect.w / 2 - balloonWidth / 2;

  return {
    spotlight,
    placement,
    balloon: {
      left: clamp(rawLeft, minLeft, maxLeft),
      top: clamp(rawTop, minTop, maxTop),
    },
    isTargetVisible,
  };
}
