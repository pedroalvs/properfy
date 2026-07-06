export const InspectionExecutionStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'FINISHED',
} as const;

export type InspectionExecutionStatus = typeof InspectionExecutionStatus[keyof typeof InspectionExecutionStatus];
