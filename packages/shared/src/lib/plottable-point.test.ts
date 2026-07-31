import { describe, it, expect } from 'vitest';
import { computeCentroid, isPlottablePoint } from './plottable-point';

describe('isPlottablePoint', () => {
  it('accepts a well-formed coordinate', () => {
    expect(isPlottablePoint({ latitude: -33.8688, longitude: 151.2093 })).toBe(true);
    expect(isPlottablePoint({ latitude: 0, longitude: 0 })).toBe(true);
  });

  it('rejects missing coordinates', () => {
    expect(isPlottablePoint({ latitude: null, longitude: 151.2 })).toBe(false);
    expect(isPlottablePoint({ latitude: -33.8, longitude: null })).toBe(false);
    expect(isPlottablePoint({ latitude: undefined, longitude: undefined })).toBe(false);
  });

  it('rejects non-finite coordinates', () => {
    expect(isPlottablePoint({ latitude: Number.NaN, longitude: 151.2 })).toBe(false);
    expect(isPlottablePoint({ latitude: -33.8, longitude: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isPlottablePoint({ latitude: Number.NEGATIVE_INFINITY, longitude: 151.2 })).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(isPlottablePoint({ latitude: 91, longitude: 151.2 })).toBe(false);
    expect(isPlottablePoint({ latitude: -91, longitude: 151.2 })).toBe(false);
    expect(isPlottablePoint({ latitude: -33.8, longitude: 181 })).toBe(false);
    expect(isPlottablePoint({ latitude: -33.8, longitude: -181 })).toBe(false);
  });

  // The poles and the antimeridian are real places, not error values — an
  // exclusive bound here would quietly drop legitimate pins.
  it('accepts the exact range boundaries', () => {
    expect(isPlottablePoint({ latitude: 90, longitude: 180 })).toBe(true);
    expect(isPlottablePoint({ latitude: -90, longitude: -180 })).toBe(true);
  });
});

describe('computeCentroid', () => {
  it('returns the point itself for a single input', () => {
    expect(computeCentroid([{ latitude: -33.8688, longitude: 151.2093 }])).toEqual({
      latitude: -33.8688,
      longitude: 151.2093,
    });
  });

  it('averages every plottable point', () => {
    expect(
      computeCentroid([
        { latitude: -33.8, longitude: 151.0 },
        { latitude: -33.6, longitude: 151.2 },
      ]),
    ).toEqual({ latitude: -33.7, longitude: 151.1 });
  });

  it('returns null for an empty input', () => {
    expect(computeCentroid([])).toBeNull();
  });

  it('returns null when no point is plottable', () => {
    expect(
      computeCentroid([
        { latitude: null, longitude: null },
        { latitude: Number.NaN, longitude: 151.2 },
        { latitude: 91, longitude: 151.2 },
      ]),
    ).toBeNull();
  });

  it('ignores unplottable points instead of poisoning the average', () => {
    // A null/NaN slipping into the sum would yield NaN, which reaches setLngLat
    // as a silently broken pin rather than an absent one.
    expect(
      computeCentroid([
        { latitude: -33.8, longitude: 151.0 },
        { latitude: null, longitude: 151.2 },
        { latitude: Number.NaN, longitude: Number.NaN },
        { latitude: -33.6, longitude: 151.2 },
      ]),
    ).toEqual({ latitude: -33.7, longitude: 151.1 });
  });

  // The whole point of the fix: two groups covering the same suburb but
  // different addresses must not collapse onto one another's coordinates.
  it('distinguishes groups whose points differ', () => {
    const a = computeCentroid([
      { latitude: -33.8148, longitude: 151.0017 },
      { latitude: -33.8236, longitude: 151.0053 },
    ]);
    const b = computeCentroid([{ latitude: -33.8148, longitude: 151.0017 }]);
    expect(a).not.toEqual(b);
  });
});
