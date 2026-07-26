import { describe, it, expect } from 'vitest';
import { isPlottablePoint } from './plottable-point';

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
