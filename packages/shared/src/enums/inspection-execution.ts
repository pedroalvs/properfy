export const InspectionAssetKind = {
  PHOTO: 'PHOTO',
  DOCUMENT: 'DOCUMENT',
  SIGNATURE: 'SIGNATURE',
} as const;

export type InspectionAssetKind = typeof InspectionAssetKind[keyof typeof InspectionAssetKind];

export const InspectionAssetStatus = {
  PENDING: 'PENDING',
  UPLOADED: 'UPLOADED',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
} as const;

export type InspectionAssetStatus = typeof InspectionAssetStatus[keyof typeof InspectionAssetStatus];

export const InspectionExecutionStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'FINISHED',
} as const;

export type InspectionExecutionStatus = typeof InspectionExecutionStatus[keyof typeof InspectionExecutionStatus];
