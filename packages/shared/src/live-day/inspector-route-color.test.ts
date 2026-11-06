import { describe, it, expect } from 'vitest';
import {
  INSPECTOR_ROUTE_PALETTE,
  inspectorRouteColor,
  inspectorRouteColorIndex,
} from './inspector-route-color';

// ── WCAG / CIELAB helpers (pure, computed in the test to catch palette drift) ──
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(hex: string, bg: string): number {
  const a = relLuminance(hex);
  const b = relLuminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}
function lStar(hex: string): number {
  const y = relLuminance(hex);
  return y <= 216 / 24389 ? (y * 24389) / 27 : Math.pow(y, 1 / 3) * 116 - 16;
}
function hueOf(mapbox: string): number {
  const m = mapbox.match(/^hsl\((\d+),/);
  return m ? parseInt(m[1]!, 10) : NaN;
}
// Deterministic uuid generator (no crypto.randomUUID, so the spread test is stable).
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('inspectorRouteColorIndex', () => {
  it('is deterministic and snapshot-stable for the all-zero uuid', () => {
    const id = '00000000-0000-0000-0000-000000000000';
    expect(inspectorRouteColorIndex(id)).toBe(9); // pins the FNV-1a hash
    expect(inspectorRouteColorIndex(id)).toBe(inspectorRouteColorIndex(id));
    expect(inspectorRouteColorIndex(id)).toBe(9);
  });

  it('spreads 1000 deterministic uuids across all 12 indices, none over 15%', () => {
    const rnd = mulberry32(42);
    const hexDigit = () => Math.floor(rnd() * 16).toString(16);
    const uuid = () => {
      let s = '';
      for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
        else if (i === 14) s += '4';
        else s += hexDigit();
      }
      return s;
    };
    const counts = new Array(12).fill(0);
    for (let i = 0; i < 1000; i++) counts[inspectorRouteColorIndex(uuid())]++;
    expect(counts.every((c) => c > 0)).toBe(true);
    expect(Math.max(...counts)).toBeLessThanOrEqual(150);
  });
});

describe('INSPECTOR_ROUTE_PALETTE', () => {
  it('has 12 entries in the L-F05-12 order with exact values', () => {
    expect(INSPECTOR_ROUTE_PALETTE).toHaveLength(12);
    expect(INSPECTOR_ROUTE_PALETTE[0]).toEqual({ index: 0, mapbox: 'hsl(45, 90%, 26%)', hex: '#7E6007' });
    expect(INSPECTOR_ROUTE_PALETTE[1]).toEqual({ index: 1, mapbox: 'hsl(250, 55%, 45%)', hex: '#4934B2' });
    expect(INSPECTOR_ROUTE_PALETTE[11]).toEqual({ index: 11, mapbox: 'hsl(0, 70%, 38%)', hex: '#A51D1D' });
    INSPECTOR_ROUTE_PALETTE.forEach((c, i) => expect(c.index).toBe(i));
  });

  it('uses comma-form HSL for every mapbox value (#1302)', () => {
    for (const { mapbox } of INSPECTOR_ROUTE_PALETTE) {
      expect(mapbox).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
    }
  });

  it('every colour clears 4.5:1 contrast against white and the map background', () => {
    for (const { hex } of INSPECTOR_ROUTE_PALETTE) {
      expect(contrast(hex, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex, '#F2EFE9')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('neighbouring indices differ in hue >= 40 deg and lightness |dL*| >= 1.4', () => {
    for (let i = 0; i < 12; i++) {
      const a = INSPECTOR_ROUTE_PALETTE[i]!;
      const b = INSPECTOR_ROUTE_PALETTE[(i + 1) % 12]!;
      const hueA = hueOf(a.mapbox);
      const hueB = hueOf(b.mapbox);
      const dHue = Math.min(Math.abs(hueA - hueB), 360 - Math.abs(hueA - hueB));
      const dL = Math.abs(lStar(a.hex) - lStar(b.hex));
      expect(dHue).toBeGreaterThanOrEqual(40);
      expect(dL).toBeGreaterThanOrEqual(1.4);
    }
  });
});

describe('inspectorRouteColor', () => {
  it('returns the palette entry at the hashed index', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const color = inspectorRouteColor(id);
    expect(color).toBe(INSPECTOR_ROUTE_PALETTE[inspectorRouteColorIndex(id)]);
    expect(color.mapbox).toMatch(/^hsl\(/);
    expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});
