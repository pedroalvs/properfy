import { describe, it, expect } from 'vitest';
import { InspectionExecutionStatus } from './inspection-execution';

describe('InspectionExecutionStatus', () => {
  it('should have NOT_STARTED, IN_PROGRESS, FINISHED values', () => {
    expect(InspectionExecutionStatus.NOT_STARTED).toBe('NOT_STARTED');
    expect(InspectionExecutionStatus.IN_PROGRESS).toBe('IN_PROGRESS');
    expect(InspectionExecutionStatus.FINISHED).toBe('FINISHED');
  });

  it('should have exactly 3 values', () => {
    expect(Object.keys(InspectionExecutionStatus)).toHaveLength(3);
  });
});
