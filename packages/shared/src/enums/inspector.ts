export const InspectorStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type InspectorStatus = (typeof InspectorStatus)[keyof typeof InspectorStatus];

export const AvailabilitySlotStatus = {
  AVAILABLE: 'AVAILABLE',
  BOOKED: 'BOOKED',
  CANCELLED: 'CANCELLED',
} as const;
export type AvailabilitySlotStatus = (typeof AvailabilitySlotStatus)[keyof typeof AvailabilitySlotStatus];
