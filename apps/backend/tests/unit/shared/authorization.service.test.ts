import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

function makeAuditService(): AuditService {
  return { log: vi.fn() };
}

function makeAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: 'CL_USER',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('AuthorizationService', () => {
  let auditService: AuditService;
  let svc: AuthorizationService;

  beforeEach(() => {
    auditService = makeAuditService();
    svc = new AuthorizationService(auditService);
  });

  // ── T004: assertRoles ──────────────────────────────────────────────

  describe('assertRoles', () => {
    it('should pass when actor role is in the allowed list', () => {
      const actor = makeAuthContext({ role: 'AM' });
      expect(() =>
        svc.assertRoles(actor, ['AM', 'OP'], { action: 'test', entityType: 'Test' }),
      ).not.toThrow();
    });

    it('should throw ForbiddenError when role is not allowed', () => {
      const actor = makeAuthContext({ role: 'CL_USER' });
      expect(() =>
        svc.assertRoles(actor, ['AM', 'OP'], { action: 'test', entityType: 'Test' }),
      ).toThrow(expect.objectContaining({ code: 'FORBIDDEN', statusCode: 403 }));
    });

    it('should log audit on denial', () => {
      const actor = makeAuthContext({ role: 'CL_USER', tenantId: 'tenant-1' });
      try {
        svc.assertRoles(actor, ['AM'], { action: 'user.create_internal', entityType: 'User', entityId: 'u-1' });
      } catch {
        // expected
      }
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization.denied',
          actorType: 'USER',
          actorId: 'user-1',
          entityType: 'User',
          tenantId: 'tenant-1',
          metadata: expect.objectContaining({
            attemptedAction: 'user.create_internal',
            requiredRoles: ['AM'],
            actualRole: 'CL_USER',
          }),
        }),
      );
    });
  });

  // ── T005: assertTenantScope ────────────────────────────────────────

  describe('assertTenantScope', () => {
    it('should pass for AM regardless of target tenant', () => {
      const actor = makeAuthContext({ role: 'AM', tenantId: null });
      expect(() =>
        svc.assertTenantScope(actor, 'any-tenant', { action: 'test', entityType: 'Test' }),
      ).not.toThrow();
    });

    it('should pass when actor tenant matches target tenant', () => {
      const actor = makeAuthContext({ role: 'OP', tenantId: 'tenant-1' });
      expect(() =>
        svc.assertTenantScope(actor, 'tenant-1', { action: 'test', entityType: 'Test' }),
      ).not.toThrow();
    });

    it('should throw when actor tenant does not match target tenant', () => {
      const actor = makeAuthContext({ role: 'OP', tenantId: 'tenant-1' });
      expect(() =>
        svc.assertTenantScope(actor, 'tenant-2', { action: 'test', entityType: 'Test' }),
      ).toThrow(expect.objectContaining({ code: 'TENANT_SCOPE_VIOLATION', statusCode: 403 }));
    });

    it('should log audit on tenant scope violation', () => {
      const actor = makeAuthContext({ role: 'CL_ADMIN', tenantId: 'tenant-1' });
      try {
        svc.assertTenantScope(actor, 'tenant-2', { action: 'property.create', entityType: 'Property', entityId: 'p-1' });
      } catch {
        // expected
      }
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization.denied',
          metadata: expect.objectContaining({
            attemptedAction: 'property.create',
            reason: 'TENANT_SCOPE_VIOLATION',
          }),
        }),
      );
    });
  });

  // ── T006: assertNotSelfApproval ────────────────────────────────────

  describe('assertNotSelfApproval', () => {
    it('should pass when actor and originator are different', () => {
      expect(() =>
        svc.assertNotSelfApproval('user-1', 'user-2', { action: 'financial.approve', entityType: 'FinancialEntry', entityId: 'fe-1' }),
      ).not.toThrow();
    });

    it('should throw SELF_APPROVAL_FORBIDDEN when actor is the originator', () => {
      expect(() =>
        svc.assertNotSelfApproval('user-1', 'user-1', { action: 'financial.approve', entityType: 'FinancialEntry', entityId: 'fe-1' }),
      ).toThrow(expect.objectContaining({ code: 'SELF_APPROVAL_FORBIDDEN', statusCode: 403 }));
    });

    it('should log audit on self-approval attempt', () => {
      try {
        svc.assertNotSelfApproval('user-1', 'user-1', { action: 'appointment.cross_check', entityType: 'Appointment', entityId: 'a-1' });
      } catch {
        // expected
      }
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization.denied',
          actorId: 'user-1',
          metadata: expect.objectContaining({
            attemptedAction: 'appointment.cross_check',
            reason: 'SELF_APPROVAL_FORBIDDEN',
          }),
        }),
      );
    });
  });

  // ── T007: assertTenantSetting ──────────────────────────────────────

  describe('assertTenantSetting', () => {
    it('should pass when setting is truthy', () => {
      const actor = makeAuthContext({ role: 'CL_ADMIN' });
      expect(() =>
        svc.assertTenantSetting({ allowClientUserManagement: true }, 'allowClientUserManagement', {
          actor,
          action: 'user.create_tenant',
          entityType: 'User',
        }),
      ).not.toThrow();
    });

    it('should throw when setting is false', () => {
      const actor = makeAuthContext({ role: 'CL_ADMIN' });
      expect(() =>
        svc.assertTenantSetting({ allowClientUserManagement: false }, 'allowClientUserManagement', {
          actor,
          action: 'user.create_tenant',
          entityType: 'User',
        }),
      ).toThrow(expect.objectContaining({ code: 'TENANT_SETTING_DISABLED', statusCode: 403 }));
    });

    it('should throw when setting is absent', () => {
      const actor = makeAuthContext({ role: 'CL_ADMIN' });
      expect(() =>
        svc.assertTenantSetting({}, 'allowClientUserManagement', {
          actor,
          action: 'user.create_tenant',
          entityType: 'User',
        }),
      ).toThrow(expect.objectContaining({ code: 'TENANT_SETTING_DISABLED', statusCode: 403 }));
    });

    it('should log audit on denial', () => {
      const actor = makeAuthContext({ role: 'CL_ADMIN', tenantId: 'tenant-1' });
      try {
        svc.assertTenantSetting({}, 'allowClientUserManagement', {
          actor,
          action: 'user.create_tenant',
          entityType: 'User',
        });
      } catch {
        // expected
      }
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization.denied',
          tenantId: 'tenant-1',
          metadata: expect.objectContaining({
            attemptedAction: 'user.create_tenant',
            reason: 'TENANT_SETTING_DISABLED',
            settingKey: 'allowClientUserManagement',
          }),
        }),
      );
    });
  });

  // ── T008: assertNoPrivilegeEscalation ──────────────────────────────

  describe('assertNoPrivilegeEscalation', () => {
    it('should allow AM to create any role', () => {
      const actor = makeAuthContext({ role: 'AM', tenantId: null });
      for (const targetRole of ['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'INSP'] as const) {
        expect(() => svc.assertNoPrivilegeEscalation(actor, targetRole)).not.toThrow();
      }
    });

    it('should allow OP to create CL_ADMIN and CL_USER', () => {
      const actor = makeAuthContext({ role: 'OP' });
      expect(() => svc.assertNoPrivilegeEscalation(actor, 'CL_ADMIN')).not.toThrow();
      expect(() => svc.assertNoPrivilegeEscalation(actor, 'CL_USER')).not.toThrow();
    });

    it('should forbid OP from creating AM, OP, or INSP', () => {
      const actor = makeAuthContext({ role: 'OP' });
      for (const targetRole of ['AM', 'OP', 'INSP'] as const) {
        expect(() => svc.assertNoPrivilegeEscalation(actor, targetRole)).toThrow(
          expect.objectContaining({ code: 'PRIVILEGE_ESCALATION', statusCode: 403 }),
        );
      }
    });

    it('should allow CL_ADMIN to create CL_ADMIN and CL_USER', () => {
      const actor = makeAuthContext({ role: 'CL_ADMIN' });
      expect(() => svc.assertNoPrivilegeEscalation(actor, 'CL_ADMIN')).not.toThrow();
      expect(() => svc.assertNoPrivilegeEscalation(actor, 'CL_USER')).not.toThrow();
    });

    it('should forbid CL_ADMIN from creating AM, OP, or INSP', () => {
      const actor = makeAuthContext({ role: 'CL_ADMIN' });
      for (const targetRole of ['AM', 'OP', 'INSP'] as const) {
        expect(() => svc.assertNoPrivilegeEscalation(actor, targetRole)).toThrow(
          expect.objectContaining({ code: 'PRIVILEGE_ESCALATION', statusCode: 403 }),
        );
      }
    });

    it('should forbid CL_USER from creating any role', () => {
      const actor = makeAuthContext({ role: 'CL_USER' });
      for (const targetRole of ['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'INSP'] as const) {
        expect(() => svc.assertNoPrivilegeEscalation(actor, targetRole)).toThrow(
          expect.objectContaining({ code: 'PRIVILEGE_ESCALATION', statusCode: 403 }),
        );
      }
    });

    it('should forbid INSP from creating any role', () => {
      const actor = makeAuthContext({ role: 'INSP' });
      for (const targetRole of ['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'INSP'] as const) {
        expect(() => svc.assertNoPrivilegeEscalation(actor, targetRole)).toThrow(
          expect.objectContaining({ code: 'PRIVILEGE_ESCALATION', statusCode: 403 }),
        );
      }
    });

    it('should log audit on escalation attempt', () => {
      const actor = makeAuthContext({ role: 'CL_ADMIN', tenantId: 'tenant-1' });
      try {
        svc.assertNoPrivilegeEscalation(actor, 'AM');
      } catch {
        // expected
      }
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization.denied',
          metadata: expect.objectContaining({
            attemptedAction: 'user.create',
            reason: 'PRIVILEGE_ESCALATION',
            targetRole: 'AM',
          }),
        }),
      );
    });
  });

  // ── Existing: assertClUserPermission ───────────────────────────────

  describe('assertClUserPermission', () => {
    it('should pass for non-CL_USER roles', () => {
      const actor = makeAuthContext({ role: 'AM' });
      expect(() => svc.assertClUserPermission(actor, 'cancel_appointments')).not.toThrow();
    });

    it('should pass when CL_USER has the permission', () => {
      const actor = makeAuthContext({ role: 'CL_USER', clUserPermissions: ['cancel_appointments'] });
      expect(() => svc.assertClUserPermission(actor, 'cancel_appointments')).not.toThrow();
    });

    it('should throw when CL_USER lacks the permission', () => {
      const actor = makeAuthContext({ role: 'CL_USER', clUserPermissions: [] });
      expect(() => svc.assertClUserPermission(actor, 'cancel_appointments')).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN', statusCode: 403 }),
      );
    });

    it('should log audit when CL_USER permission is denied', () => {
      const actor = makeAuthContext({ role: 'CL_USER', clUserPermissions: [], tenantId: 'tenant-1' });
      try {
        svc.assertClUserPermission(actor, 'cancel_appointments');
      } catch {
        // expected
      }
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization.denied',
          actorId: 'user-1',
          tenantId: 'tenant-1',
          metadata: expect.objectContaining({
            attemptedAction: 'cl_user_permission_check',
            missingPermission: 'cancel_appointments',
          }),
        }),
      );
    });
  });
});
