import { describe, it, expect } from 'vitest';
import { canPerform, getRequiredClUserFlag } from '../permissions';

describe('permissions utility', () => {
  describe('canPerform', () => {
    it('should return true for AM on any action', () => {
      expect(canPerform('AM', 'user.create_internal')).toBe(true);
      expect(canPerform('AM', 'tenant.create')).toBe(true);
      expect(canPerform('AM', 'financial.approve')).toBe(true);
    });

    it('should return true for OP on operational actions', () => {
      expect(canPerform('OP', 'tenant.create')).toBe(true);
      expect(canPerform('OP', 'financial.approve')).toBe(true);
      expect(canPerform('OP', 'inspector.create')).toBe(true);
    });

    it('should return false for OP on AM-only actions', () => {
      expect(canPerform('OP', 'user.create_internal')).toBe(false);
      expect(canPerform('OP', 'appointment.reopen_done')).toBe(false);
    });

    it('should return true for CL_ADMIN on client actions', () => {
      expect(canPerform('CL_ADMIN', 'user.list')).toBe(true);
      expect(canPerform('CL_ADMIN', 'config.time_slots')).toBe(true);
    });

    it('should return false for CL_ADMIN on operational actions', () => {
      expect(canPerform('CL_ADMIN', 'financial.approve')).toBe(false);
      expect(canPerform('CL_ADMIN', 'inspector.create')).toBe(false);
    });

    it('should return true for INSP on inspector-specific actions', () => {
      expect(canPerform('INSP', 'marketplace.view_offers')).toBe(true);
      expect(canPerform('INSP', 'marketplace.accept_offer')).toBe(true);
      expect(canPerform('INSP', 'inspector.view_own')).toBe(true);
    });

    it('should return false for INSP on non-inspector actions', () => {
      expect(canPerform('INSP', 'appointment.create')).toBe(false);
      expect(canPerform('INSP', 'user.list')).toBe(false);
    });

    it('should return false for null/undefined role', () => {
      expect(canPerform(null, 'user.list')).toBe(false);
      expect(canPerform(undefined, 'user.list')).toBe(false);
    });

    it('should return false for unknown action', () => {
      expect(canPerform('AM', 'nonexistent.action')).toBe(false);
    });
  });

  describe('getRequiredClUserFlag', () => {
    it('should return the flag key for CL_USER-flagged actions', () => {
      expect(getRequiredClUserFlag('appointment.create')).toBe('create_appointments');
      expect(getRequiredClUserFlag('appointment.cancel')).toBe('cancel_appointments');
      expect(getRequiredClUserFlag('report.export')).toBe('export_reports');
    });

    it('should return undefined for non-flagged actions', () => {
      expect(getRequiredClUserFlag('tenant.create')).toBeUndefined();
      expect(getRequiredClUserFlag('financial.approve')).toBeUndefined();
    });

    it('should return undefined for unknown actions', () => {
      expect(getRequiredClUserFlag('nonexistent.action')).toBeUndefined();
    });
  });
});
