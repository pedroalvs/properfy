export const AppointmentContactRole = {
  TENANT: 'TENANT',
  TENANT_REPRESENTATIVE: 'TENANT_REPRESENTATIVE',
  HOUSEKEEPER: 'HOUSEKEEPER',
  PROPERTY_MANAGER: 'PROPERTY_MANAGER',
  BROKER: 'BROKER',
  OTHER: 'OTHER',
} as const;
export type AppointmentContactRole = (typeof AppointmentContactRole)[keyof typeof AppointmentContactRole];
