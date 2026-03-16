import { describe, it, expect } from 'vitest';
import {
  InspectionAssetKind,
  InspectionAssetStatus,
  InspectionExecutionStatus,
} from './inspection-execution';

describe('InspectionAssetKind', () => {
  it('should have PHOTO, DOCUMENT, SIGNATURE values', () => {
    expect(InspectionAssetKind.PHOTO).toBe('PHOTO');
    expect(InspectionAssetKind.DOCUMENT).toBe('DOCUMENT');
    expect(InspectionAssetKind.SIGNATURE).toBe('SIGNATURE');
  });

  it('should have exactly 3 values', () => {
    expect(Object.keys(InspectionAssetKind)).toHaveLength(3);
  });
});

describe('InspectionAssetStatus', () => {
  it('should have PENDING, UPLOADED, UPLOAD_FAILED values', () => {
    expect(InspectionAssetStatus.PENDING).toBe('PENDING');
    expect(InspectionAssetStatus.UPLOADED).toBe('UPLOADED');
    expect(InspectionAssetStatus.UPLOAD_FAILED).toBe('UPLOAD_FAILED');
  });

  it('should have exactly 3 values', () => {
    expect(Object.keys(InspectionAssetStatus)).toHaveLength(3);
  });
});

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
