import { describe, it, expect } from 'vitest';
import { getRetentionPeriod, RETENTION_TIER } from '../../../src/modules/audit/domain/audit-retention';

describe('getRetentionPeriod', () => {
  describe('financial tier (7 years)', () => {
    it.each([
      'financial.entryCreated',
      'financial.entryApproved',
      'billing.invoiceGenerated',
      'invoice.paid',
      'refund.created',
      'manualAdjustment.created',
    ])('returns 7-year retention for %s', (action) => {
      expect(getRetentionPeriod(action)).toBe(RETENTION_TIER.FINANCIAL);
    });
  });

  describe('high-volume tier (2 years)', () => {
    it.each([
      'auth.loginSuccess',
      'auth.refreshToken',
      'auth.tokenVerified',
      'portal.view',
      'read.appointment',
      'read.property',
    ])('returns 2-year retention for %s', (action) => {
      expect(getRetentionPeriod(action)).toBe(RETENTION_TIER.HIGH_VOLUME);
    });
  });

  describe('general tier (5 years)', () => {
    it.each([
      'appointment.statusTransition',
      'tenant.created',
      'user.created',
      'property.updated',
      'inspector.updated',
      'serviceGroup.published',
      'notification.sent',
      'report.requested',
      'auth.loginFailure',
      'auth.passwordChanged',
    ])('returns 5-year retention for %s', (action) => {
      expect(getRetentionPeriod(action)).toBe(RETENTION_TIER.GENERAL);
    });
  });
});
