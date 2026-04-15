export const NotificationChannel = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  SKIPPED_OPT_OUT: 'SKIPPED_OPT_OUT',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const NotificationClass = {
  TRANSACTIONAL: 'TRANSACTIONAL',
  OPERATIONAL: 'OPERATIONAL',
  MARKETING: 'MARKETING',
} as const;
export type NotificationClass = (typeof NotificationClass)[keyof typeof NotificationClass];

export const ConsentChangeSource = {
  unsubscribe_link: 'unsubscribe_link',
  operator_override: 'operator_override',
  re_opt_in: 're_opt_in',
} as const;
export type ConsentChangeSource = (typeof ConsentChangeSource)[keyof typeof ConsentChangeSource];

export const WhatsAppApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type WhatsAppApprovalStatus = (typeof WhatsAppApprovalStatus)[keyof typeof WhatsAppApprovalStatus];

export const NotificationAttemptStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
export type NotificationAttemptStatus = (typeof NotificationAttemptStatus)[keyof typeof NotificationAttemptStatus];
