import { describe, it, expect, vi } from 'vitest';
import { GetPortalLinkUseCase } from './get-portal-link.use-case';
import { AppointmentNotFoundError } from '../../domain/appointment.errors';
import { ConfirmationCycleNotFoundError, PortalTokenNotDecryptableError } from '../../domain/confirmation-cycle.errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { AppointmentEntity } from '../../domain/appointment.entity';
import { TenantPortalTokenEntity } from '../../../tenant-portal/domain/tenant-portal-token.entity';

const AM_ACTOR = { userId: 'user-am', tenantId: null, branchId: null, role: 'AM' as const, inspectorId: null };
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
    expiresAt: new Date('2026-06-02'),
    status: 'ACTIVE',
    usedAt: null,
    lastAccessedAt: null,
    rawTokenEncrypted,
    confirmationCycleId: 'cycle-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('GetPortalLinkUseCase', () => {
  it('should return portalUrl and expiresAt when token exists with rawTokenEncrypted', async () => {
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment('cycle-1'),
        contact: null,
        contacts: [],
        restrictions: [],
      }),
    };
    const tokenRepo = { findActiveByAppointmentId: vi.fn().mockResolvedValue(makeToken('enc-token')) };
    const encrypter = { decrypt: vi.fn().mockReturnValue('raw-token-abc'), encrypt: vi.fn() };
    const auth = new AuthorizationService({ log: vi.fn() } as any);

    const uc = new GetPortalLinkUseCase(appointmentRepo as any, tokenRepo as any, encrypter, PORTAL_BASE, auth);
    const result = await uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR });

    expect(result.portalUrl).toContain('/portal/');
    expect(result.portalUrl).toContain('raw-token-abc');
    expect(result.expiresAt).toBeDefined();
  });

  it('should throw AppointmentNotFoundError when appointment not found', async () => {
    const appointmentRepo = { findById: vi.fn().mockResolvedValue(null) };
    const tokenRepo = { findActiveByAppointmentId: vi.fn() };
    const encrypter = { decrypt: vi.fn(), encrypt: vi.fn() };
    const auth = new AuthorizationService({ log: vi.fn() } as any);

    const uc = new GetPortalLinkUseCase(appointmentRepo as any, tokenRepo as any, encrypter, PORTAL_BASE, auth);

    await expect(uc.execute({ appointmentId: 'missing', actor: AM_ACTOR })).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should throw ConfirmationCycleNotFoundError when no active cycle', async () => {
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(null),
        contact: null,
        contacts: [],
        restrictions: [],
      }),
    };
    const tokenRepo = { findActiveByAppointmentId: vi.fn() };
    const encrypter = { decrypt: vi.fn(), encrypt: vi.fn() };
    const auth = new AuthorizationService({ log: vi.fn() } as any);

    const uc = new GetPortalLinkUseCase(appointmentRepo as any, tokenRepo as any, encrypter, PORTAL_BASE, auth);

    await expect(uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR })).rejects.toThrow(ConfirmationCycleNotFoundError);
  });

  it('should throw PortalTokenNotDecryptableError when decryption fails', async () => {
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment('cycle-1'),
        contact: null,
        contacts: [],
        restrictions: [],
      }),
    };
    const tokenRepo = { findActiveByAppointmentId: vi.fn().mockResolvedValue(makeToken('corrupted')) };
    const encrypter = { decrypt: vi.fn().mockImplementation(() => { throw new Error('auth tag mismatch'); }), encrypt: vi.fn() };
    const auth = new AuthorizationService({ log: vi.fn() } as any);

    const uc = new GetPortalLinkUseCase(appointmentRepo as any, tokenRepo as any, encrypter, PORTAL_BASE, auth);

    await expect(uc.execute({ appointmentId: 'appt-1', actor: AM_ACTOR })).rejects.toThrow(PortalTokenNotDecryptableError);
  });
});
