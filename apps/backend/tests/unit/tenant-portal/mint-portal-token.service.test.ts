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
    tryClaim: ReturnType<typeof vi.fn>;
    releaseClaim: ReturnType<typeof vi.fn>;
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
      tryClaim: vi.fn().mockResolvedValue(true),
      releaseClaim: vi.fn(),
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

  // Tokens are 10 base62 chars (~59.5 bits), so a token_hash clash is rare but
  // not impossible — and it grows with the stored row count, since the unique
  // index spans revoked and expired rows too. The write is what detects it, and
  // the answer is simply to mint another token.
  describe('token_hash collision', () => {
    // Postgres reports meta.target as an array even for a single-column index;
    // that is the shape the retry helper sees in production.
    function uniqueViolation(column: string) {
      return Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: [column] },
      });
    }

    it('mints a fresh token and writes again after a collision', async () => {
      tokenService.generateRawToken.mockReturnValueOnce('collided01').mockReturnValueOnce('survivor02');
      tokenService.hashToken.mockImplementation((raw: string) => `hash-${raw}`);
      tokenRepo.revokeAndSave.mockRejectedValueOnce(uniqueViolation('token_hash')).mockResolvedValue(undefined);

      const result = await svc.mint(makeAppointment(), makeTenant());

      expect(result.rawToken).toBe('survivor02');
      expect(tokenRepo.revokeAndSave).toHaveBeenCalledTimes(2);
      const [, secondEntity] = tokenRepo.revokeAndSave.mock.calls[1] as [string, { tokenHash: string }];
      expect(secondEntity.tokenHash).toBe('hash-survivor02');
    });

    it('gives up after three attempts rather than looping forever', async () => {
      const error = uniqueViolation('token_hash');
      tokenRepo.revokeAndSave.mockRejectedValue(error);

      await expect(svc.mint(makeAppointment(), makeTenant())).rejects.toBe(error);
      expect(tokenRepo.revokeAndSave).toHaveBeenCalledTimes(3);
    });

    it('does not retry a conflict on another column', async () => {
      const error = uniqueViolation('portal_token_id');
      tokenRepo.revokeAndSave.mockRejectedValue(error);

      await expect(svc.mint(makeAppointment(), makeTenant())).rejects.toBe(error);
      expect(tokenRepo.revokeAndSave).toHaveBeenCalledTimes(1);
    });

    // Postgres aborts the caller's transaction the moment the constraint trips,
    // so a second write on that same `tx` could only fail with 25P02. The caller
    // that opened the transaction retries the whole unit of work instead.
    it('does not retry inside a caller-owned transaction', async () => {
      const error = uniqueViolation('token_hash');
      tokenRepo.revokeAndSave.mockRejectedValue(error);
      const tx = {} as never;

      await expect(svc.mint(makeAppointment(), makeTenant(), tx)).rejects.toBe(error);
      expect(tokenRepo.revokeAndSave).toHaveBeenCalledTimes(1);
    });
  });
});
