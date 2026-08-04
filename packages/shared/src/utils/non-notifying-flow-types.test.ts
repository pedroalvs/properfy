import { describe, it, expect } from 'vitest';
import {
  suppressesOccupantNotifications,
  isWithheldForNonNotifyingFlow,
} from './non-notifying-flow-types';

describe('suppressesOccupantNotifications', () => {
  it.each(['INGOING', 'OUTGOING'])('is true for %s', (flowType) => {
    expect(suppressesOccupantNotifications(flowType)).toBe(true);
  });

  it('is false for ROUTINE', () => {
    expect(suppressesOccupantNotifications('ROUTINE')).toBe(false);
  });

  // Fail open: silencing an occupant we should have contacted is worse than
  // sending one message too many, so anything unrecognised keeps notifying.
  it.each([null, undefined, '', 'STANDARD', 'ingoing', 'Outgoing'])(
    'is false for the unrecognised value %p',
    (flowType) => {
      expect(suppressesOccupantNotifications(flowType as string | null | undefined)).toBe(false);
    },
  );
});

describe('isWithheldForNonNotifyingFlow', () => {
  it.each([
    'INSPECTION_NOTICE',
    'INSPECTION_NOTICE_SMS',
    'REMINDER_7_DAYS',
    'REMINDER_5_DAYS_SMS',
    'REMINDER_3_DAYS',
    'TENANT_SMS_ALERT',
    'INSPECTION_CONFIRMED',
    'INSPECTION_RESCHEDULED',
    'INSPECTION_CANCELLED',
    'INSPECTION_UNAVAILABILITY_REPORTED',
    'TENANT_PORTAL_LINK',
  ])('withholds the occupant-directed %s', (code) => {
    expect(isWithheldForNonNotifyingFlow(code)).toBe(true);
  });

  // Targeted at the agency, but only ever sent to chase a tenant who has not
  // responded — which cannot happen when no response was expected.
  it('withholds PROPERTY_MANAGER_ESCALATION even though it is agency-directed', () => {
    expect(isWithheldForNonNotifyingFlow('PROPERTY_MANAGER_ESCALATION')).toBe(true);
  });

  // The load-bearing half. These must keep flowing for INGOING/OUTGOING.
  it.each([
    // Same PROPERTY_MANAGER target as the escalation above: reports something
    // that really happened, so it is not withheld.
    'INSPECTION_CANCELLED_AGENCY',
    'INSPECTION_REJECTED_AGENCY',
    'TENANT_NOTICE_FORWARDED_AGENCY',
    'INSPECTOR_GROUP_ASSIGNED',
    'INSPECTOR_GROUP_UNASSIGNED',
    'INSPECTOR_GROUP_RESCHEDULED',
    'INSPECTION_STUCK_ALERT',
    'PASSWORD_RESET',
    'REPORT_READY',
    'REPORT_FAILED',
  ])('keeps sending %s', (code) => {
    expect(isWithheldForNonNotifyingFlow(code)).toBe(false);
  });

  it('keeps sending a custom code outside both catalogs', () => {
    expect(isWithheldForNonNotifyingFlow('SOME_TENANT_CUSTOM_CODE')).toBe(false);
  });
});
