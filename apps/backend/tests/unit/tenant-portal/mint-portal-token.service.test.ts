import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MintPortalTokenService } from '../../../src/modules/rental-tenant-portal/domain/mint-portal-token.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import type { IRentalTenantPortalTokenRepository } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-token.repository';
import type { TokenService } from '../../../src/modules/rental-tenant-portal/domain/token.service';

const RAW_TOKEN = 'a'.repeat(64);
const TOKEN_HASH = 'h'.repeat(64);
const EXPIRES_AT = new Date('2026-04-29T09:00:00.000Z');

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    appointmentNumber: 1,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'st-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-04-30'),
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 200,
    payoutAmount: 140,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeTenant(overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {}) {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

describe('MintPortalTokenService', () => {
  let tokenRepo: {
    findByTokenHash: ReturnType<typeof vi.fn>;
    findActiveByAppointmentId: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    revokeAndSave: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    updateLastAccessedAt: ReturnType<typeof vi.fn>;
    markUsed: ReturnType<typeof vi.fn>;
    revokeAllForAppointment: ReturnType<typeof vi.fn>;
    expireActiveTokens: ReturnType<typeof vi.fn>;
  };
  let tokenService: {
    generateRawToken: ReturnType<typeof vi.fn>;
    hashToken: ReturnType<typeof vi.fn>;
    computeExpiresAt: ReturnType<typeof vi.fn>;
  };
  let svc: MintPortalTokenService;

  beforeEach(() => {
    tokenRepo = {
      findByTokenHash: vi.fn(),
      findActiveByAppointmentId: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      revokeAndSave: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn(),
      updateLastAccessedAt: vi.fn(),
      markUsed: vi.fn(),
      revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
      expireActiveTokens: vi.fn().mockResolvedValue(0),
    };
    tokenService = {
      generateRawToken: vi.fn().mockReturnValue(RAW_TOKEN),
      hashToken: vi.fn().mockReturnValue(TOKEN_HASH),
      computeExpiresAt: vi.fn().mockReturnValue(EXPIRES_AT),
    };
    svc = new MintPortalTokenService(
      tokenRepo as unknown as IRentalTenantPortalTokenRepository,
      tokenService as unknown as TokenService,
    );
  });

  it('returns rawToken and expiresAt from the token service', async () => {
    const result = await svc.mint(makeAppointment(), makeTenant());
    expect(result.rawToken).toBe(RAW_TOKEN);
    expect(result.expiresAt).toEqual(EXPIRES_AT);
  });

  it('H4: calls revokeAndSave instead of separate revoke + save (atomic operation)', async () => {
    await svc.mint(makeAppointment(), makeTenant());
    expect(tokenRepo.revokeAndSave).toHaveBeenCalledTimes(1);
    expect(tokenRepo.revokeAllForAppointment).not.toHaveBeenCalled();
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('H4: revokeAndSave receives the appointment id and a new token entity', async () => {
    const appointment = makeAppointment({ id: 'appt-42' });
    await svc.mint(appointment, makeTenant());
    expect(tokenRepo.revokeAndSave).toHaveBeenCalledWith(
      'appt-42',
      expect.objectContaining({
        appointmentId: 'appt-42',
        tokenHash: TOKEN_HASH,
        status: 'ACTIVE',
      }),
      undefined,
    );
  });

  it('H4: throws when tenant.id does not match appointment.tenantId', async () => {
    const appointment = makeAppointment({ tenantId: 'tenant-A' });
    const tenant = makeTenant({ id: 'tenant-B' });
    await expect(svc.mint(appointment, tenant)).rejects.toThrow('Tenant mismatch');
  });

  it('uses default cutoffHour=19 and cutoffDaysBefore=1 when not in settings', async () => {
    await svc.mint(makeAppointment(), makeTenant({ settingsJson: {} }));
    expect(tokenService.computeExpiresAt).toHaveBeenCalledWith(
      expect.any(String),
      'Australia/Sydney',
      19,
      1,
    );
  });

  it('uses custom cutoffHour and cutoffDaysBefore from tenant settings', async () => {
    const tenant = makeTenant({ settingsJson: { portalCutoffHour: 17, portalCutoffDaysBefore: 2 } });
    await svc.mint(makeAppointment(), tenant);
    expect(tokenService.computeExpiresAt).toHaveBeenCalledWith(
      expect.any(String),
      'Australia/Sydney',
      17,
      2,
    );
  });

  it('passes scheduledDate string in YYYY-MM-DD format to computeExpiresAt', async () => {
    const appointment = makeAppointment({ scheduledDate: new Date('2026-08-15') });
    await svc.mint(appointment, makeTenant());
    const [dateArg] = tokenService.computeExpiresAt.mock.calls[0] as [string, ...unknown[]];
    expect(dateArg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
