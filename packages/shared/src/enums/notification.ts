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
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

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
