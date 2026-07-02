export const ImportStatus = {
  PENDING: 'PENDING',
  // Appointment-import-specific: a record sits here after the synchronous
  // preview and before commit is requested. Property import never assigns it.
  PREVIEW: 'PREVIEW',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];
