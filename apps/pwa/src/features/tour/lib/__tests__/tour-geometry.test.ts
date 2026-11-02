import { describe, expect, it } from 'vitest';
import { computeTourGeometry, type Rect } from '../tour-geometry';

const VIEWPORT = { width: 390, height: 844 };
const NO_INSETS = { safeTop: 0, safeBottom: 0 };
const BALLOON = { width: 320, height: 160 };

function geom(targetRect: Rect | null, over: Partial<Parameters<typeof computeTourGeometry>[0]> = {}) {
  return computeTourGeometry({
    targetRect,
    viewport: VIEWPORT,
    insets: NO_INSETS,
    padding: 8,
    gutter: 16,
    balloon: BALLOON,
    ...over,
  });
}

describe('computeTourGeometry', () => {
  it('expands the target by padding into the spotlight rect', () => {
    const g = geom({ x: 20, y: 600, w: 100, h: 44 });
    expect(g.spotlight).toEqual({ x: 12, y: 592, w: 116, h: 60 });
  });

  it('places the balloon below a target in the top half', () => {
    const g = geom({ x: 20, y: 80, w: 100, h: 44 });
    expect(g.placement).toBe('bottom');
    // Balloon fully on screen vertically.
    expect(g.balloon.top).toBeGreaterThanOrEqual(0);
    expect(g.balloon.top + BALLOON.height).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it('places the balloon above a target near the bottom bar', () => {
    const g = geom({ x: 20, y: 790, w: 100, h: 44 });
    expect(g.placement).toBe('top');
    expect(g.balloon.top).toBeGreaterThanOrEqual(0);
  });

  it('clamps the balloon horizontally to the gutters', () => {
    const g = geom({ x: 380, y: 400, w: 10, h: 10 });
    expect(g.balloon.left).toBeGreaterThanOrEqual(16);
    expect(g.balloon.left + BALLOON.width).toBeLessThanOrEqual(VIEWPORT.width - 16);
  });

  it('keeps the balloon out of the safe-area insets', () => {
    const insets = { safeTop: 47, safeBottom: 34 };
    const g = geom({ x: 20, y: 60, w: 100, h: 44 }, { insets });
    expect(g.balloon.top).toBeGreaterThanOrEqual(insets.safeTop);
    expect(g.balloon.top + BALLOON.height).toBeLessThanOrEqual(VIEWPORT.height - insets.safeBottom);
  });

  it('centers when there is no target (install step)', () => {
    const g = geom(null);
    expect(g.placement).toBe('center');
    expect(g.spotlight).toBeNull();
  });

  it('reports a zero-size target as not visible', () => {
    expect(geom({ x: 0, y: 0, w: 0, h: 0 }).isTargetVisible).toBe(false);
  });

  it('reports a fully off-screen target as not visible', () => {
    expect(geom({ x: 20, y: -200, w: 100, h: 44 }).isTargetVisible).toBe(false);
    expect(geom({ x: 20, y: 900, w: 100, h: 44 }).isTargetVisible).toBe(false);
  });

  it('reports an on-screen non-empty target as visible', () => {
    expect(geom({ x: 20, y: 400, w: 100, h: 44 }).isTargetVisible).toBe(true);
  });
});
