import { describe, it, expect } from 'vitest';
import { InspectorStatus, AvailabilitySlotStatus } from './inspector';

describe('InspectorStatus', () => {
  it('should have ACTIVE, INACTIVE values', () => {
    expect(InspectorStatus.ACTIVE).toBe('ACTIVE');
    expect(InspectorStatus.INACTIVE).toBe('INACTIVE');
  });

  it('should have exactly 2 statuses', () => {
    expect(Object.keys(InspectorStatus)).toHaveLength(2);
  });
});

describe('AvailabilitySlotStatus', () => {
  it('should have AVAILABLE, BOOKED, CANCELLED values', () => {
    expect(AvailabilitySlotStatus.AVAILABLE).toBe('AVAILABLE');
    expect(AvailabilitySlotStatus.BOOKED).toBe('BOOKED');
    expect(AvailabilitySlotStatus.CANCELLED).toBe('CANCELLED');
  });

  it('should have exactly 3 statuses', () => {
    expect(Object.keys(AvailabilitySlotStatus)).toHaveLength(3);
  });
});
