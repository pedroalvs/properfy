import { describe, it, expect } from 'vitest';
import { serviceWeightMinutes } from './service-weight';

describe('serviceWeightMinutes', () => {
  it('adds planned travel to the duration (factor 1)', () => {
    expect(serviceWeightMinutes({ durationMinutes: 30, plannedTravelMinutes: 10 })).toBe(40);
  });

  it('equals the duration when there is no plan (travel 0)', () => {
    expect(serviceWeightMinutes({ durationMinutes: 45, plannedTravelMinutes: 0 })).toBe(45);
  });

  it('keeps fractional travel minutes unrounded (travel_s 90 → 1.5)', () => {
    expect(serviceWeightMinutes({ durationMinutes: 30, plannedTravelMinutes: 1.5 })).toBe(31.5);
  });
});
