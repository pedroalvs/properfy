export const ContactType = {
  RENTAL_TENANT: 'RENTAL_TENANT',
  PROPERTY_MANAGER: 'PROPERTY_MANAGER',
  HOUSEKEEPER: 'HOUSEKEEPER',
  BROKER: 'BROKER',
  OTHER: 'OTHER',
} as const;
export type ContactType = (typeof ContactType)[keyof typeof ContactType];
