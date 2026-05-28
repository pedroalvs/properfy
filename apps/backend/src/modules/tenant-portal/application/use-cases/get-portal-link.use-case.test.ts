import { describe, it, expect, vi } from 'vitest';
import { GetPortalLinkUseCase } from './get-portal-link.use-case';
import { AppointmentNotFoundError } from '../../../appointment/domain/appointment.errors';
import { PortalTokenNotDecryptableError } from '../../../appointment/domain/confirmation-cycle.errors';
import { NoActivePortalTokenError } from '../../domain/tenant-portal.errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { AppointmentEntity } from '../../../appointment/domain/appointment.entity';
import { TenantPortalTokenEntity } from '../../domain/tenant-portal-token.entity';

const AM_ACTOR = { userId: 'user-am', tenantId: null, branchId: null, role: 'AM' as const, inspectorId: null };
const OP_ACTOR = { userId: 'user-op', tenantId: 'tenant-1', branchId: null, role: 'OP' as const, inspectorId: null };
const CL_ACTOR = { userId: 'user-cl', tenantId: 'tenant-1', branchId: null, role: 'CL_ADMIN' as const, inspectorId: null };
const PORTAL_BASE = 'https://portal.properfy.test';

function makeAppointment(activeConfirmationCycleId: string | null = 'cycle-1'): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    appointmentNumber: 1,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'svc-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-06-01'),
    timeSlot: '09:00-10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    tenantNote: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    activeConfirmationCycleId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

function makeToken(rawTokenEncrypted: string | null = 'encrypted-raw'): TenantPortalTokenEntity {
  return new TenantPortalTokenEntity({
    id: 'token-1',
    appointmentId: 'appt-1',
    tokenHash: 'hash-abc',
    expiresAt: new Date('2026-06-02T12:00:00.000Z'),
    status: 'ACTIVE',
    usedAt: null,
    lastAccessedAt: null,
    rawTokenEncrypted,
    confirmationCycleId: 'cycle-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeAudit(): AuditService {
  return { log: vi.fn() } as unknown as AuditService;
}

function makeUseCase(overrides: {
  appointmentRepo?: object;
  tokenRepo?: object;
  encrypter?: object;
  audit?: AuditService;
  actor?: typeof AM_ACTOR;
}) {
  const audit = overrides.audit ?? makeAudit();
  const auth = new AuthorizationService({ log: vi.fn() } as any);
  const uc = new GetPortalLinkUseCase(
    (overrides.appointmentRepo ?? {}) as any,
    (overrides.tokenRepo ?? {}) as any,
    (overrides.encrypter ?? { decrypt: vi.fn().mockReturnValue('raw'), encrypt: vi.fn() }) as any,
    PORTAL_BASE,
    auth,
    audit,
  );
  return { uc, audit };
}

describe('GetPortalLinkUseCase', () => {
  describe('happy path', () => {
    it('should return URL containing /tenant-portal/ and emit audit with metadata', async () => {
      const audit = makeAudit();
      const appointmentRepo = {
        findById: vi.fn().mockResolvedValue({ appointment: makeAppointment('cycle-1'), contact: null, contacts: [], restrictions: [] }),
      };
      const tokenRepo = { findActiveByAppointmentId: vi.fn().mockResolvedValue(makeToken('enc-token')) };
      const encrypter = { decrypt: vi.fn().mockReturnValue('raw-token-abc'), encrypt: vi.fn() };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo, encrypter, audit });

      const result = await uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR });

      expect(result.portalUrl).toContain('/tenant-portal/');
      expect(result.portalUrl).toContain('raw-token-abc');
      expect(result.expiresAt).toBeDefined();
      expect(vi.mocked(audit.log)).toHaveBeenCalledOnce();
      expect(vi.mocked(audit.log)).toHaveBeenCalledWith(expect.objectContaining({
        action: 'tenant_portal.link_copied',
        actorType: 'USER',
        actorId: AM_ACTOR.userId,
        entityType: 'Appointment',
        entityId: 'appt-1',
        tenantId: 'tenant-1',
        metadata: expect.objectContaining({ tokenId: 'token-1' }),
      }));
    });
  });

  describe('404 — no active portal token', () => {
    it('should throw NoActivePortalTokenError when appointment has no activeConfirmationCycleId and no active token exists', async () => {
      // AC-2.6: early-reject removed. findActiveByAppointmentId is now always called.
      // When cycleId=null AND no ACTIVE token row → NoActivePortalTokenError (same end result).
      const appointmentRepo = {
        findById: vi.fn().mockResolvedValue({ appointment: makeAppointment(null), contact: null, contacts: [], restrictions: [] }),
      };
      const tokenRepo = { findActiveByAppointmentId: vi.fn().mockResolvedValue(null) };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo });

      await expect(uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR })).rejects.toThrow(NoActivePortalTokenError);
      expect(tokenRepo.findActiveByAppointmentId).toHaveBeenCalled();
    });

    it('should throw NoActivePortalTokenError when no active token row exists in DB', async () => {
      const appointmentRepo = {
        findById: vi.fn().mockResolvedValue({ appointment: makeAppointment('cycle-1'), contact: null, contacts: [], restrictions: [] }),
      };
      const tokenRepo = { findActiveByAppointmentId: vi.fn().mockResolvedValue(null) };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo });

      await expect(uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR })).rejects.toThrow(NoActivePortalTokenError);
    });
  });

  describe('404 — appointment not found', () => {
    it('should throw AppointmentNotFoundError when appointment not found', async () => {
      const appointmentRepo = { findById: vi.fn().mockResolvedValue(null) };
      const tokenRepo = { findActiveByAppointmentId: vi.fn() };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo });

      await expect(uc.execute({ appointmentId: 'missing', actor: AM_ACTOR })).rejects.toThrow(AppointmentNotFoundError);
    });

    it('should throw AppointmentNotFoundError for OP querying cross-tenant appointment (tenant scope returns null)', async () => {
      const appointmentRepo = { findById: vi.fn().mockResolvedValue(null) };
      const tokenRepo = { findActiveByAppointmentId: vi.fn() };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo });

      await expect(uc.execute({ appointmentId: 'appt-foreign', actor: OP_ACTOR })).rejects.toThrow(AppointmentNotFoundError);
    });
  });

  describe('409 — token not decryptable', () => {
    it('should throw PortalTokenNotDecryptableError when rawTokenEncrypted is null', async () => {
      const appointmentRepo = {
        findById: vi.fn().mockResolvedValue({ appointment: makeAppointment('cycle-1'), contact: null, contacts: [], restrictions: [] }),
      };
      const tokenRepo = { findActiveByAppointmentId: vi.fn().mockResolvedValue(makeToken(null)) };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo });

      await expect(uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR })).rejects.toThrow(PortalTokenNotDecryptableError);
    });

    it('should throw PortalTokenNotDecryptableError when decryption throws', async () => {
      const appointmentRepo = {
        findById: vi.fn().mockResolvedValue({ appointment: makeAppointment('cycle-1'), contact: null, contacts: [], restrictions: [] }),
      };
      const tokenRepo = { findActiveByAppointmentId: vi.fn().mockResolvedValue(makeToken('corrupted')) };
      const encrypter = { decrypt: vi.fn().mockImplementation(() => { throw new Error('auth tag mismatch'); }), encrypt: vi.fn() };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo, encrypter });

      await expect(uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR })).rejects.toThrow(PortalTokenNotDecryptableError);
    });
  });

  describe('403 — unauthorized roles', () => {
    it('should throw ForbiddenError when actor is CL_ADMIN', async () => {
      const appointmentRepo = { findById: vi.fn() };
      const tokenRepo = { findActiveByAppointmentId: vi.fn() };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo });

      await expect(uc.execute({ appointmentId: 'appt-1', actor: CL_ACTOR })).rejects.toThrow();
      expect(appointmentRepo.findById).not.toHaveBeenCalled();
    });
  });

  /**
   * AC-2.6 regression tests — portal-link endpoint alignment with hasActivePortalToken
   *
   * Per Planejador round-1 BLOCKER fix: the early-reject at lines 44-46 must be removed.
   * `findActiveByAppointmentId` (post-T028 patch) is the SOLE authority.
   *
   * TC-PL-1 is the critical regression case: cycle null + token ACTIVE+valid → 200.
   * This currently fails RED because the early-reject fires before the token check.
   */
  describe('AC-2.6 — findActiveByAppointmentId is the sole authority (no cycle proxy)', () => {
    it('TC-PL-1: should return 200+portalUrl when activeConfirmationCycleId is null but ACTIVE+valid token exists', async () => {
      // Regression case: appointment has no cycle yet (legacy / bypassed path),
      // but a token was minted directly. The early-reject at lines 44-46 must NOT fire.
      const appointmentRepo = {
        findById: vi.fn().mockResolvedValue({
          appointment: makeAppointment(null),  // cycle null — the regression trigger
          contact: null, contacts: [], restrictions: [],
        }),
      };
      const tokenRepo = {
        findActiveByAppointmentId: vi.fn().mockResolvedValue(makeToken('enc-token')),
      };
      const encrypter = { decrypt: vi.fn().mockReturnValue('raw-token-abc'), encrypt: vi.fn() };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo, encrypter });

      // Currently throws NoActivePortalTokenError (409) due to early-reject.
      // After fix: returns 200 + portalUrl.
      const result = await uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR });

      expect(result.portalUrl).toContain('/tenant-portal/');
      expect(result.portalUrl).toContain('raw-token-abc');
    });

    it('TC-PL-2: should return 200+portalUrl when cycle is non-null and ACTIVE+valid token exists', async () => {
      const appointmentRepo = {
        findById: vi.fn().mockResolvedValue({
          appointment: makeAppointment('cycle-1'),  // cycle present
          contact: null, contacts: [], restrictions: [],
        }),
      };
      const tokenRepo = {
        findActiveByAppointmentId: vi.fn().mockResolvedValue(makeToken('enc-token')),
      };
      const encrypter = { decrypt: vi.fn().mockReturnValue('raw-token-xyz'), encrypt: vi.fn() };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo, encrypter });

      const result = await uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR });

      expect(result.portalUrl).toContain('raw-token-xyz');
    });

    it('TC-PL-3: should throw NoActivePortalTokenError when cycle is non-null but token is REVOKED (findActiveByAppointmentId returns null)', async () => {
      const appointmentRepo = {
        findById: vi.fn().mockResolvedValue({
          appointment: makeAppointment('cycle-1'),
          contact: null, contacts: [], restrictions: [],
        }),
      };
      const tokenRepo = {
        findActiveByAppointmentId: vi.fn().mockResolvedValue(null),  // REVOKED/expired = not found
      };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo });

      await expect(uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR })).rejects.toThrow(NoActivePortalTokenError);
    });

    it('TC-PL-4: should throw NoActivePortalTokenError when cycle is non-null and no token row exists', async () => {
      const appointmentRepo = {
        findById: vi.fn().mockResolvedValue({
          appointment: makeAppointment('cycle-1'),
          contact: null, contacts: [], restrictions: [],
        }),
      };
      const tokenRepo = {
        findActiveByAppointmentId: vi.fn().mockResolvedValue(null),
      };
      const { uc } = makeUseCase({ appointmentRepo, tokenRepo });

      await expect(uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR })).rejects.toThrow(NoActivePortalTokenError);
    });
  });
});
