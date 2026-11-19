import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  cellCenter,
  periodToInstants,
  toCellIndex,
} from '../../../src/modules/inspector-execution/domain/execution-density-grid';

/** Haversine distance in metres between two lat/lng points. */
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

describe('cellCenter', () => {
  it('G1: returns the center of a Sydney cell', () => {
    expect(cellCenter({ latIndex: -33869, lngIndex: 151209 })).toEqual({
      lat: -33.8685,
      lng: 151.2095,
    });
  });

  it('G2: center of the (0,0) cell is (0.0005, 0.0005)', () => {
    expect(cellCenter({ latIndex: 0, lngIndex: 0 })).toEqual({ lat: 0.0005, lng: 0.0005 });
  });

  it('G3: center of the (-1,-1) cell is (-0.0005, -0.0005) (floor in negatives)', () => {
    expect(cellCenter({ latIndex: -1, lngIndex: -1 })).toEqual({ lat: -0.0005, lng: -0.0005 });
  });

  it('G4: a center always has at most 4 decimal places', () => {
    for (let i = 0; i < 1000; i += 1) {
      const latIndex = Math.floor((Math.random() - 0.5) * 180_000);
      const lngIndex = Math.floor((Math.random() - 0.5) * 360_000);
      const { lat, lng } = cellCenter({ latIndex, lngIndex });
      expect(Number(lat.toFixed(4))).toBe(lat);
      expect(Number(lng.toFixed(4))).toBe(lng);
    }
  });

  it('G6: the real point is within 75 m of its cell center', () => {
    const real = { lat: -33.86882, lng: 151.20929 };
    const center = cellCenter({
      latIndex: toCellIndex('-33.8688200'),
      lngIndex: toCellIndex('151.2092900'),
    });
    expect(haversineMeters(real, center)).toBeLessThanOrEqual(75);
  });
});

describe('toCellIndex', () => {
  it('G5: mirrors FLOOR(x * 1000) exactly', () => {
    expect(toCellIndex('-33.8688200')).toBe(-33869);
    expect(toCellIndex('151.2092900')).toBe(151209);
  });

  it('G5a: is exact on and around grid lines', () => {
    expect(toCellIndex('-33.8690000')).toBe(-33869);
    expect(toCellIndex('-33.8690001')).toBe(-33870);
    expect(toCellIndex('-33.8689999')).toBe(-33869);
    expect(toCellIndex('151.2090000')).toBe(151209);
    expect(toCellIndex('151.2089999')).toBe(151208);
    expect(toCellIndex('0.0010000')).toBe(1);
    expect(toCellIndex('-0.0010000')).toBe(-1);
    expect(toCellIndex('0.0000000')).toBe(0);
    expect(toCellIndex('-0.0000001')).toBe(-1);
  });

  it('G5b: takes the decimal string of a Prisma.Decimal, never a number', () => {
    const value = new Prisma.Decimal('-33.869').toFixed(7); // '-33.8690000'
    expect(toCellIndex(value)).toBe(-33869);
    // Compile-time-only guard: passing a number must fail `tsc`. Declared but never
    // invoked, so the type error is asserted without running `.startsWith` on a number.
    const _rejectsNumber = (): number =>
      // @ts-expect-error toCellIndex must reject a number argument at the type level.
      toCellIndex(-33.869);
    expect(typeof _rejectsNumber).toBe('function');
  });
});

describe('periodToInstants', () => {
  it('G7: a 23 h Sydney day (DST start) maps to the correct half-open UTC interval', () => {
    expect(periodToInstants('2026-10-04', '2026-10-04')).toEqual({
      from: new Date('2026-10-03T14:00:00.000Z'),
      toExclusive: new Date('2026-10-04T13:00:00.000Z'),
    });
  });

  it('G8: a 25 h Sydney day (DST end) maps to the correct half-open UTC interval', () => {
    expect(periodToInstants('2026-04-05', '2026-04-05')).toEqual({
      from: new Date('2026-04-04T13:00:00.000Z'),
      toExclusive: new Date('2026-04-05T14:00:00.000Z'),
    });
  });
});
