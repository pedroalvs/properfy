import { describe, it, expect } from 'vitest';
import { resolveMarkerCollisions, type ScreenPoint } from '../marker-collision';

const D = 36;

/** Where each marker actually ends up once its offset is applied. */
function finalPositions(points: ScreenPoint[], diameter = D): ScreenPoint[] {
  const offsets = resolveMarkerCollisions(points, diameter);
  return points.map((p, i) => ({ x: p.x + offsets[i]![0], y: p.y + offsets[i]![1] }));
}

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The whole point of the module: no drawn pin may overlap another. */
function expectNoOverlap(points: ScreenPoint[], diameter = D) {
  const placed = finalPositions(points, diameter).filter((p) => Number.isFinite(p.x));
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      expect(distance(placed[i]!, placed[j]!)).toBeGreaterThanOrEqual(diameter - 1e-6);
    }
  }
}

describe('resolveMarkerCollisions', () => {
  it('leaves well-separated markers untouched', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 500, y: 500 },
      { x: 1000, y: 0 },
    ];
    expect(resolveMarkerCollisions(points, D)).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  it('leaves markers exactly one diameter apart untouched — touching is not overlapping', () => {
    const points = [
      { x: 0, y: 0 },
      { x: D, y: 0 },
    ];
    expect(resolveMarkerCollisions(points, D)).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('splits two identical points into a touching horizontal pair', () => {
    const points = [
      { x: 100, y: 100 },
      { x: 100, y: 100 },
    ];
    const placed = finalPositions(points);

    // Centred on the shared point, one diameter between centres.
    expect(placed).toEqual([
      { x: 100 - D / 2, y: 100 },
      { x: 100 + D / 2, y: 100 },
    ]);
    expect(distance(placed[0]!, placed[1]!)).toBeCloseTo(D, 6);
  });

  it('lays three identical points out as a centred row', () => {
    const points = [
      { x: 50, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 20 },
    ];
    expect(finalPositions(points)).toEqual([
      { x: 50 - D, y: 20 },
      { x: 50, y: 20 },
      { x: 50 + D, y: 20 },
    ]);
  });

  it('pushes partially overlapping markers apart to exactly one diameter', () => {
    // 10px apart — the 36px circles overlap heavily.
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const placed = finalPositions(points);
    expect(distance(placed[0]!, placed[1]!)).toBeCloseTo(D, 6);
    expectNoOverlap(points);
  });

  it('merges clusters whose rows would collide after being laid out', () => {
    // Two pairs 40px apart: neither pair collides with the other initially, but
    // laying each out as its own row spreads them into each other. Without the
    // re-check pass this returns overlapping positions.
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 0 },
    ];
    expectNoOverlap(points);
    expect(new Set(finalPositions(points).map((p) => p.x)).size).toBe(4);
  });

  it('keeps a dense pile fully separated', () => {
    const points = Array.from({ length: 8 }, () => ({ x: 200, y: 200 }));
    expectNoOverlap(points);
  });

  it('separates a mixed field of piles and loners', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 3, y: 2 },
      { x: 400, y: 400 },
      { x: 402, y: 401 },
      { x: 900, y: 10 },
    ];
    expectNoOverlap(points);
  });

  it('ignores non-finite points and gives them a zero offset', () => {
    // Map.project() returns MAX_VALUE for points behind a pitched camera.
    const points = [
      { x: 100, y: 100 },
      { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
      { x: Number.NaN, y: 0 },
    ];
    const offsets = resolveMarkerCollisions(points, D);
    expect(offsets[1]).toEqual([0, 0]);
    expect(offsets[2]).toEqual([0, 0]);
    // The lone finite point had nothing to collide with.
    expect(offsets[0]).toEqual([0, 0]);
  });

  it('does not let a non-finite point drag a real one out of place', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: Number.POSITIVE_INFINITY, y: 5 },
    ];
    const offsets = resolveMarkerCollisions(points, D);
    expect(offsets[2]).toEqual([0, 0]);
    expect(distance(
      { x: 10 + offsets[0]![0], y: 10 + offsets[0]![1] },
      { x: 10 + offsets[1]![0], y: 10 + offsets[1]![1] },
    )).toBeCloseTo(D, 6);
  });

  it('is deterministic and index-aligned', () => {
    const points = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ];
    expect(resolveMarkerCollisions(points, D)).toEqual(resolveMarkerCollisions(points, D));
    expect(resolveMarkerCollisions(points, D)).toHaveLength(points.length);
  });

  it('returns an empty result for no points', () => {
    expect(resolveMarkerCollisions([], D)).toEqual([]);
  });
});
