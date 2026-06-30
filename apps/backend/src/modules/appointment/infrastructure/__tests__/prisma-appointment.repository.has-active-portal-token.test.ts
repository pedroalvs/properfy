import { describe, it, expect, vi } from 'vitest';
import { PrismaAppointmentRepository } from '../prisma-appointment.repository';

/**
 * Unit tests for PrismaAppointmentRepository.findById — hasActivePortalToken (T019)
 *
 * Implements TC-1 through TC-7 from contracts/appointment-response.contract.md.
 *
 * These tests verify that findById computes hasActivePortalToken correctly by
 * including a filtered `rental_tenant_portal_tokens` relation in the Prisma query.
 *
 * Per spec §3.B2, Regras invariant B.1.
 */

const BASE_ROW = {
  id: 'appt-1',
  appointment_number: 1,
  tenant_id: 'tenant-1',
  branch_id: 'branch-1',
  property_id: 'prop-1',
  service_type_id: 'svc-1',
  inspector_id: null,
  status: 'SCHEDULED',
  scheduled_date: new Date('2026-06-01'),
  time_slot: '09:00-10:00',
  key_required: false,
  meeting_location: null,
  key_location: null,
  rental_tenant_confirmation_status: 'PENDING',
  active_confirmation_cycle_id: null,
  price_amount: 100,
  payout_amount: 80,
  pricing_rule_snapshot_json: {},
  notes: null,
  rental_tenant_note: null,
  custom_fields_json: null,
  reason: null,
  cancellation_reason_code: null,
  rejection_reason_code: null,
  created_by_user_id: 'user-1',
  done_marked_by_user_id: null,
  done_checked_by_user_id: null,
  done_checked_at: null,
  service_group_id: null,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
  contacts: [],
  restrictions: [],
  property: { property_code: 'PROP-001', street: '1 Test St', suburb: 'Sydney', state: 'NSW', postcode: '2000', lat: null, lng: null },
  tenant: { name: 'Test Agency', settings_json: {} },
  branch: { name: 'Test Branch' },
  service_type: { name: 'Standard' },
  inspector: null,
};

// Prisma relation field is `portal_tokens` (Prisma model field name).
// The DB table is `rental_tenant_portal_tokens` via @@map("rental_tenant_portal_tokens") on RentalTenantPortalToken.
function makeRow(overrides: { rentalTenantPortalTokens?: Array<{ id: string }> } = {}): typeof BASE_ROW & { portal_tokens: Array<{ id: string }> } {
  return {
    ...BASE_ROW,
    portal_tokens: overrides.rentalTenantPortalTokens ?? [],
  };
}

function makePrisma(row: object | null) {
  return {
    appointment: { findFirst: vi.fn().mockResolvedValue(row) },
  } as any;
}

describe('PrismaAppointmentRepository.findById — hasActivePortalToken', () => {
  it('TC-1: should return hasActivePortalToken:false when appointment has no tokens', async () => {
    const repo = new PrismaAppointmentRepository(makePrisma(makeRow({ rentalTenantPortalTokens: [] })));

    const result = await repo.findById('appt-1', null);

    expect((result as any).hasActivePortalToken).toBe(false);
  });

  it('TC-2: should return hasActivePortalToken:true for ACTIVE token with expires_at in future', async () => {
    const repo = new PrismaAppointmentRepository(makePrisma(makeRow({
      rentalTenantPortalTokens: [{ id: 'token-1' }],
    })));

    const result = await repo.findById('appt-1', null);

    expect((result as any).hasActivePortalToken).toBe(true);
  });

  it('TC-3: should return hasActivePortalToken:false when Prisma filtered include returns empty (expired token excluded)', async () => {
    // Prisma's filtered include applies expires_at > now() server-side.
    // If the token is expired, Prisma returns an empty array.
    const repo = new PrismaAppointmentRepository(makePrisma(makeRow({
      rentalTenantPortalTokens: [],  // Prisma returned empty because expiry filter excluded it
    })));

    const result = await repo.findById('appt-1', null);

    expect((result as any).hasActivePortalToken).toBe(false);
  });

  it('TC-4: should return hasActivePortalToken:false when Prisma returns empty (REVOKED token excluded)', async () => {
    const repo = new PrismaAppointmentRepository(makePrisma(makeRow({
      rentalTenantPortalTokens: [],  // Prisma filtered out the REVOKED token
    })));

    const result = await repo.findById('appt-1', null);

    expect((result as any).hasActivePortalToken).toBe(false);
  });

  it('TC-5: should return hasActivePortalToken:false for SUPERSEDED token (filtered out by status predicate)', async () => {
    const repo = new PrismaAppointmentRepository(makePrisma(makeRow({
      rentalTenantPortalTokens: [],  // Prisma filtered out SUPERSEDED token
    })));

    const result = await repo.findById('appt-1', null);

    expect((result as any).hasActivePortalToken).toBe(false);
  });

  it('TC-6: should return hasActivePortalToken:false for EXPIRED status token (filtered out)', async () => {
    const repo = new PrismaAppointmentRepository(makePrisma(makeRow({
      rentalTenantPortalTokens: [],  // Prisma filtered out EXPIRED status token
    })));

    const result = await repo.findById('appt-1', null);

    expect((result as any).hasActivePortalToken).toBe(false);
  });

  it('TC-7: should return hasActivePortalToken:true when one ACTIVE+valid token exists alongside a SUPERSEDED one', async () => {
    // Prisma include with status='ACTIVE' and expires_at>now() returns only the valid token
    const repo = new PrismaAppointmentRepository(makePrisma(makeRow({
      rentalTenantPortalTokens: [{ id: 'token-current' }],  // Only the valid one passes the filter
    })));

    const result = await repo.findById('appt-1', null);

    expect((result as any).hasActivePortalToken).toBe(true);
  });

  it('should include portal_tokens in the Prisma include with status+expiry predicate', async () => {
    // `portal_tokens` is the Prisma relation field name on the Appointment model.
    // DB table is `rental_tenant_portal_tokens` via @@map on RentalTenantPortalToken.
    const mockPrisma = makePrisma(makeRow());
    const repo = new PrismaAppointmentRepository(mockPrisma);

    const before = new Date();
    await repo.findById('appt-1', null);
    const after = new Date();

    expect(mockPrisma.appointment.findFirst).toHaveBeenCalledOnce();
    const callArgs = mockPrisma.appointment.findFirst.mock.calls[0][0];

    // The include MUST contain the portal_tokens relation with the predicate
    expect(callArgs.include).toMatchObject({
      portal_tokens: {
        where: {
          status: 'ACTIVE',
          expires_at: { gt: expect.any(Date) },
        },
        select: { id: true },
        take: 1,
      },
    });

    // The date must be approximately now (Node clock authority per AC-2.5)
    const usedDate: Date = callArgs.include.portal_tokens.where.expires_at.gt;
    expect(usedDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(usedDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
