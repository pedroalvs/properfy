import { describe, it, expect } from 'vitest';
import {
  InspectorFieldEventType,
  FieldIssueReason,
  FIELD_ISSUE_REASON_LABELS,
  FIELD_ISSUE_NOTE_REQUIRED_REASONS,
  LateNoticeReason,
  LATE_NOTICE_REASON_LABELS,
  LATE_NOTICE_MINUTES_OPTIONS,
} from './field-events';

describe('InspectorFieldEventType', () => {
  it('has exactly CANT_DO and LATE_NOTICE', () => {
    expect(Object.keys(InspectorFieldEventType).sort()).toEqual(['CANT_DO', 'LATE_NOTICE']);
    expect(InspectorFieldEventType.CANT_DO).toBe('CANT_DO');
    expect(InspectorFieldEventType.LATE_NOTICE).toBe('LATE_NOTICE');
  });
});

describe('FieldIssueReason', () => {
  it('has exactly the 6 reasons', () => {
    expect(Object.keys(FieldIssueReason).sort()).toEqual(
      ['CANT_ATTEND', 'KEY_FAILED', 'NO_ANSWER', 'SITE_ISSUE', 'TENANT_REFUSED', 'UNSAFE'].sort(),
    );
  });

  it('has a label for every reason', () => {
    for (const reason of Object.values(FieldIssueReason)) {
      expect(FIELD_ISSUE_REASON_LABELS[reason]).toBeTruthy();
    }
  });

  it('requires a note only for SITE_ISSUE', () => {
    expect(FIELD_ISSUE_NOTE_REQUIRED_REASONS).toEqual(['SITE_ISSUE']);
  });
});

describe('LateNoticeReason', () => {
  it('has exactly the 4 reasons', () => {
    expect(Object.keys(LateNoticeReason).sort()).toEqual(
      ['OTHER', 'PERSONAL', 'PREVIOUS_JOB_OVERRAN', 'TRAFFIC'].sort(),
    );
  });

  it('has a label for every reason', () => {
    for (const reason of Object.values(LateNoticeReason)) {
      expect(LATE_NOTICE_REASON_LABELS[reason]).toBeTruthy();
    }
  });

  it('offers the expected minute options', () => {
    expect(LATE_NOTICE_MINUTES_OPTIONS).toEqual([10, 20, 30, 45, 60, 90]);
  });
});
