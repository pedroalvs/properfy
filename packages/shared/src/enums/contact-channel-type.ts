export const ContactChannelType = {
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
} as const;
export type ContactChannelType = (typeof ContactChannelType)[keyof typeof ContactChannelType];
