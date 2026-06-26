/**
 * Group pins on the appointments map follow the SAME standard as appointment
 * pins: a black teardrop whose status is encoded by an MDI icon (not by color).
 * This pins the status -> icon mapping so a new ServiceGroupStatus can't ship
 * without a glyph, and so the groups mode never regresses to colored circles.
 */

import { describe, it, expect } from 'vitest';
import { ServiceGroupStatus } from '@properfy/shared';
import { GROUP_STATUS_ICONS } from './AppointmentMapPage';

describe('GROUP_STATUS_ICONS', () => {
  it('covers every ServiceGroupStatus value', () => {
    const statuses = Object.values(ServiceGroupStatus);
    expect(Object.keys(GROUP_STATUS_ICONS)).toHaveLength(statuses.length);
    for (const status of statuses) {
      expect(GROUP_STATUS_ICONS[status]).toBeDefined();
    }
  });

  it('maps each status to a valid mdi- icon class', () => {
    for (const icon of Object.values(GROUP_STATUS_ICONS)) {
      expect(icon).toMatch(/^mdi-[a-z0-9-]+$/);
    }
  });

  it('reuses the appointment status glyphs for shared semantics', () => {
    // Group statuses mirror the analogous appointment status icon so the two
    // modes read as one visual language.
    expect(GROUP_STATUS_ICONS[ServiceGroupStatus.DRAFT]).toBe('mdi-pencil');
    expect(GROUP_STATUS_ICONS[ServiceGroupStatus.PUBLISHED]).toBe('mdi-account-clock');
    expect(GROUP_STATUS_ICONS[ServiceGroupStatus.ACCEPTED]).toBe('mdi-calendar-check');
    expect(GROUP_STATUS_ICONS[ServiceGroupStatus.CANCELLED]).toBe('mdi-cancel');
    expect(GROUP_STATUS_ICONS[ServiceGroupStatus.REJECTED]).toBe('mdi-close-octagon');
  });
});
