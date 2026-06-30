export const AppointmentContactRole = {
  RENTAL_TENANT: 'RENTAL_TENANT',
  RENTAL_TENANT_REPRESENTATIVE: 'RENTAL_TENANT_REPRESENTATIVE',
  HOUSEKEEPER: 'HOUSEKEEPER',
  PROPERTY_MANAGER: 'PROPERTY_MANAGER',
  BROKER: 'BROKER',
  OTHER: 'OTHER',
} as const;
export type AppointmentContactRole = (typeof AppointmentContactRole)[keyof typeof AppointmentContactRole];
