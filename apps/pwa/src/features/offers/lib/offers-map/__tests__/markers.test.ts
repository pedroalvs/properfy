import { describe, it, expect, vi } from 'vitest';
import {
  PRIMARY_COLOR,
  PIN_DIAMETER_PX,
  makeMarkerEl,
  makeAppointmentMarkerEl,
  isValidCoordinate,
  applyCollisionOffsets,
  type PlacedMarker,
} from '../markers';

describe('offers-map markers', () => {
  describe('makeMarkerEl', () => {
    it('builds a group pin with the count, testid, aria-label and primary fill', () => {
      const el = makeMarkerEl(3);
      expect(el.getAttribute('data-testid')).toBe('map-pin');
      expect(el.getAttribute('aria-label')).toBe('Group with 3 inspections');
      expect(el.textContent).toBe('3');
      // jsdom normalises cssText spacing; compare whitespace-agnostically.
      expect(el.style.cssText.replace(/\s/g, '')).toContain(`background-color:${PRIMARY_COLOR}`);
    });

    it('singularises the aria-label for a single inspection', () => {
      expect(makeMarkerEl(1).getAttribute('aria-label')).toBe('Group with 1 inspection');
    });
  });

  describe('makeAppointmentMarkerEl', () => {
    it('labels with a 1-based position and uses the primary ring/text', () => {
      const el = makeAppointmentMarkerEl(0);
      expect(el.getAttribute('data-testid')).toBe('map-appointment-pin');
      expect(el.getAttribute('aria-label')).toBe('Inspection 1 details');
      expect(el.textContent).toBe('1');
      const css = el.style.cssText.replace(/\s/g, '');
      expect(css).toContain(`border:2.5pxsolid${PRIMARY_COLOR}`);
      expect(css).toContain(`color:${PRIMARY_COLOR}`);
    });
  });

  describe('isValidCoordinate', () => {
    it('rejects null', () => {
      expect(isValidCoordinate(null)).toBe(false);
    });
    it('accepts an in-range coordinate', () => {
      expect(isValidCoordinate({ lat: -33.87, lng: 151.21 })).toBe(true);
    });
    it('rejects a NaN coordinate', () => {
      expect(isValidCoordinate({ lat: Number.NaN, lng: 151.21 })).toBe(false);
    });
  });

  describe('applyCollisionOffsets', () => {
    const marker = () => ({ setOffset: vi.fn() });

    it('does nothing for an empty list', () => {
      expect(() => applyCollisionOffsets([])).not.toThrow();
    });

    it('offsets coincident pins and leaves a lone pin at zero, ordered by id', () => {
      const a = marker();
      const b = marker();
      const placed: PlacedMarker[] = [
        // Deliberately out of id order to prove the stable sort.
        { id: 'b', marker: b as never, lng: 151.21, lat: -33.87 },
        { id: 'a', marker: a as never, lng: 151.21, lat: -33.87 },
      ];
      applyCollisionOffsets(placed);
      expect(a.setOffset).toHaveBeenCalledTimes(1);
      expect(b.setOffset).toHaveBeenCalledTimes(1);
      // Two coincident pins must not land on the same offset.
      const offA = a.setOffset.mock.calls[0][0];
      const offB = b.setOffset.mock.calls[0][0];
      expect(offA).not.toEqual(offB);
    });
  });

  it('exposes the pin diameter used by the collision pass', () => {
    expect(PIN_DIAMETER_PX).toBe(36);
  });
});
