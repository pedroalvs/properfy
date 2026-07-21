import { describe, it, expect, vi } from 'vitest';
import { MintPortalTokenService } from '../mint-portal-token.service';
import { TokenService } from '../token.service';
import { RentalTenantPortalTokenEntity } from '../rental-tenant-portal-token.entity';
import { TenantEntity } from '../../../tenant/domain/tenant.entity';
import { AppointmentEntity } from '../../../appointment/domain/appointment.entity';

const SYDNEY = 'Australia/Sydney';

function makeTenant(settingsJson: Record<string, unknown> = {}): TenantEntity {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: SYDNEY,
    currency: 'AUD',
    settingsJson,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

function makeAppointment(scheduledDate: string): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    appointmentNumber: 1,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'svc-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date(scheduledDate),
    timeSlotStart: '09:00',
    timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    rentalTenantNote: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    activeConfirmationCycleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

function makeService() {
  const saved: RentalTenantPortalTokenEntity[] = [];
  const tokenRepo = {
    revokeAndSave: vi.fn(async (_appointmentId: string, entity: RentalTenantPortalTokenEntity) => {
      saved.push(entity);
    }),
  };
  const service = new MintPortalTokenService(tokenRepo as never, new TokenService());
  return { service, tokenRepo, saved };
}

describe('MintPortalTokenService — expiry floor and confirm cutoff', () => {
  it('sets confirmCutoffAt to the T-1 cutoff (19:00 Sydney the day before, AEST)', async () => {
    const { service, saved } = makeService();

    await service.mint(makeAppointment('2026-06-01'), makeTenant());

    // 19:00 on 2026-05-31 in Australia/Sydney (AEST, UTC+10) = 09:00 UTC
    expect(saved[0]!.confirmCutoffAt?.toISOString()).toBe('2026-05-31T09:00:00.000Z');
  });

  it('sets expiresAt to end of the scheduled day, not the cutoff (token never born expired)', async () => {
    const { service, saved } = makeService();

    const result = await service.mint(makeAppointment('2026-06-01'), makeTenant());

    // Midnight after 2026-06-01 in Australia/Sydney (AEST, UTC+10) = 2026-06-01T14:00Z
    expect(result.expiresAt.toISOString()).toBe('2026-06-01T14:00:00.000Z');
    expect(saved[0]!.expiresAt.toISOString()).toBe('2026-06-01T14:00:00.000Z');
    expect(saved[0]!.expiresAt.getTime()).toBeGreaterThan(saved[0]!.confirmCutoffAt!.getTime());
  });

  it('handles the AEDT (daylight saving) offset for both cutoff and end of day', async () => {
    const { service, saved } = makeService();

    // 2026-10-05 is after the first Sunday of October — Sydney is on AEDT (UTC+11)
    await service.mint(makeAppointment('2026-10-05'), makeTenant());

    expect(saved[0]!.confirmCutoffAt?.toISOString()).toBe('2026-10-04T08:00:00.000Z');
    expect(saved[0]!.expiresAt.toISOString()).toBe('2026-10-05T13:00:00.000Z');
  });

  it('respects tenant-configured cutoff settings for confirmCutoffAt', async () => {
    const { service, saved } = makeService();

    await service.mint(
      makeAppointment('2026-06-10'),
      makeTenant({ portalCutoffHour: 12, portalCutoffDaysBefore: 2 }),
    );

    // 12:00 on 2026-06-08 Sydney (AEST) = 02:00 UTC
    expect(saved[0]!.confirmCutoffAt?.toISOString()).toBe('2026-06-08T02:00:00.000Z');
    expect(saved[0]!.expiresAt.toISOString()).toBe('2026-06-10T14:00:00.000Z');
  });
});

describe('RentalTenantPortalTokenEntity.isPastConfirmCutoff', () => {
  function makeToken(overrides: { confirmCutoffAt?: Date | null; expiresAt?: Date }) {
    return new RentalTenantPortalTokenEntity({
      id: 'token-1',
      appointmentId: 'appt-1',
      tokenHash: 'hash',
      expiresAt: overrides.expiresAt ?? new Date('2026-06-01T14:00:00.000Z'),
      confirmCutoffAt: overrides.confirmCutoffAt,
      status: 'ACTIVE',
      usedAt: null,
      lastAccessedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  it('is false before the cutoff and true after it', () => {
    const token = makeToken({ confirmCutoffAt: new Date('2026-05-31T09:00:00.000Z') });

    expect(token.isPastConfirmCutoff(new Date('2026-05-31T08:59:59.000Z'))).toBe(false);
    expect(token.isPastConfirmCutoff(new Date('2026-05-31T09:00:01.000Z'))).toBe(true);
  });

  it('falls back to expiresAt for legacy rows without confirmCutoffAt', () => {
    const token = makeToken({ confirmCutoffAt: null, expiresAt: new Date('2026-05-31T09:00:00.000Z') });

    expect(token.isPastConfirmCutoff(new Date('2026-05-31T08:00:00.000Z'))).toBe(false);
    expect(token.isPastConfirmCutoff(new Date('2026-05-31T10:00:00.000Z'))).toBe(true);
  });
});
