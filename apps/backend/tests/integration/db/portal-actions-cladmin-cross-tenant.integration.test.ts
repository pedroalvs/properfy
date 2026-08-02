/**
 * PR #1061 (CL_ADMIN portal actions) — end-to-end Postgres proof that the four
 * newly-widened surfaces cannot reach another agency's appointment.
 *
 * Why this exists separately from the unit guards:
 * every other cross-tenant proof for these four use cases is mock-based, and a
 * mock of `IAppointmentRepository.findById` decides for itself what a given
 * `tenantId` argument returns. The thing actually keeping agencies apart is one
 * line of production SQL in `PrismaAppointmentRepository.findById`:
 *
 *     const where = { id, deleted_at: null };
 *     if (tenantId) where['tenant_id'] = tenantId;   // <-- fails OPEN on null
 *
 * That conditional is exactly the "mocks-mask-the-WHERE-tenant_id" trap recorded
 * in `feedback_mock_masks_real_bug.md`, and no test in this PR exercised it.
 * Here the repository is the REAL `PrismaAppointmentRepository` against real
 * Postgres, so the SQL is under test rather than a stand-in for it.
 *
 * What's covered — for each of the four endpoints, a CL_ADMIN of TenantA acting
 * on an appointment owned by TenantB:
 *   1. GET  portal-link        → AppointmentNotFoundError
 *   2. GET  portal-activities  → APPOINTMENT_NOT_FOUND
 *   3. POST force-confirmation → AppointmentNotFoundError, row NOT mutated
 *   4. POST portal-token       → APPOINTMENT_NOT_FOUND, no token minted
 * plus the positive control for each (CL_ADMIN on its OWN appointment succeeds),
 * without which the negatives would also pass against a use case that rejects
 * everything.
 *
 * Collaborators other than the appointment repository are mocked: the SQL tenant
 * filter is the surface under test, not notification/minting behaviour.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaRentalTenantPortalActivityRepository } from '../../../src/modules/rental-tenant-portal/infrastructure/prisma-rental-tenant-portal-activity.repository';
import { GetPortalLinkUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/get-portal-link.use-case';
import { ListPortalActivitiesUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/list-portal-activities.use-case';
import { GeneratePortalTokenUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/generate-portal-token.use-case';
import { ForceManualTenantConfirmationUseCase } from '../../../src/modules/appointment/application/use-cases/force-manual-confirmation.use-case';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

let harness: DbHarness;
let appointmentRepo: PrismaAppointmentRepository;
let activityRepo: PrismaRentalTenantPortalActivityRepository;
let auditService: AuditService;
let authorizationService: AuthorizationService;

let getPortalLink: GetPortalLinkUseCase;
let listActivities: ListPortalActivitiesUseCase;
let forceConfirm: ForceManualTenantConfirmationUseCase;
let generateToken: GeneratePortalTokenUseCase;

const mintSpy = vi.fn();

const seed = {
  tenantA: '',
  tenantB: '',
  apptInA: '',
  apptInB: '',
};

/** CL_ADMIN of TenantA — the actor that must never reach TenantB. */
function clAdminOfA(): AuthContext {
  return { userId: 'user-a', tenantId: seed.tenantA, role: 'CL_ADMIN', branchId: null, inspectorId: null };
}

const rnd = () => Math.random().toString(36).slice(2, 8);

async function seedAgency(label: string) {
  const tenant = await harness.prisma.tenant.create({
    data: { name: `PR1061-${label}`, legal_name: `${label} LLC`, status: 'ACTIVE' },
  });
  const branch = await harness.prisma.branch.create({
    data: { tenant_id: tenant.id, name: `${label}-Branch`, status: 'ACTIVE' },
  });
  const user = await harness.prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'CL_ADMIN',
      name: `${label}-User`,
      email: `pr1061-${label.toLowerCase()}-${rnd()}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await harness.prisma.property.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id,
      property_code: `PR1061-${label}-${rnd()}`,
      type: 'HOUSE',
      street: `1 ${label} St`, suburb: label, postcode: '3000', state: 'VIC', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  return { tenant, branch, user, property };
}

beforeAll(async () => {
  harness = await setupDbHarness();
  appointmentRepo = new PrismaAppointmentRepository(harness.prisma);
  activityRepo = new PrismaRentalTenantPortalActivityRepository(harness.prisma);
  auditService = { log: vi.fn() } as unknown as AuditService;
  authorizationService = new AuthorizationService({ log: vi.fn() } as never);

  const serviceType = await harness.prisma.serviceType.create({
    data: {
      code: `PR1061-ST-${rnd()}`,
      name: 'Routine Inspection', flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true, status: 'ACTIVE',
    },
  });

  const a = await seedAgency('A');
  const b = await seedAgency('B');
  seed.tenantA = a.tenant.id;
  seed.tenantB = b.tenant.id;

  for (const [agency, key] of [[a, 'apptInA'], [b, 'apptInB']] as const) {
    const appt = await harness.prisma.appointment.create({
      data: {
        tenant_id: agency.tenant.id, branch_id: agency.branch.id,
        property_id: agency.property.id, service_type_id: serviceType.id,
        status: 'SCHEDULED', scheduled_date: new Date('2027-05-20'),
        time_slot_start: '09:00', time_slot_end: '12:00',
        price_amount: '100.00', payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'PENDING',
        created_by_user_id: agency.user.id,
      },
    });
    seed[key] = appt.id;
  }

  // An ACTIVE portal token on B's appointment, so the negative Copy test fails
  // on the tenant gate rather than trivially on "no token exists".
  await harness.prisma.rentalTenantPortalToken.create({
    data: {
      appointment_id: seed.apptInB,
      token_hash: `hash-${rnd()}`,
      raw_token_encrypted: 'encrypted-b',
      expires_at: new Date('2027-06-01T12:00:00Z'),
      status: 'ACTIVE',
    },
  });
  await harness.prisma.rentalTenantPortalToken.create({
    data: {
      appointment_id: seed.apptInA,
      token_hash: `hash-${rnd()}`,
      raw_token_encrypted: 'encrypted-a',
      expires_at: new Date('2027-06-01T12:00:00Z'),
      status: 'ACTIVE',
    },
  });

  // Portal activity on B's appointment, so a leak would return a non-empty list.
  await harness.prisma.rentalTenantPortalActivity.create({
    data: {
      appointment_id: seed.apptInB,
      rental_tenant_portal_token_id: (await harness.prisma.rentalTenantPortalToken.findFirst({
        where: { appointment_id: seed.apptInB },
      }))!.id,
      action: 'VIEW',
      ip_address: '10.0.0.1',
      user_agent: 'BAgent',
    },
  });

  const tokenRepo = {
    findActiveByAppointmentId: (appointmentId: string) =>
      harness.prisma.rentalTenantPortalToken.findFirst({
        where: { appointment_id: appointmentId, status: 'ACTIVE' },
      }).then((r) => (r ? { id: r.id, rawTokenEncrypted: r.raw_token_encrypted, expiresAt: r.expires_at } : null)),
  };
  // No ':' in the fake plaintext — the use case percent-encodes the token into
  // the URL, which would otherwise turn a colon into %3A and obscure the assert.
  const encrypter = { decrypt: (v: string) => `decrypted-${v}`, encrypt: (v: string) => v };

  getPortalLink = new GetPortalLinkUseCase(
    appointmentRepo,
    tokenRepo as never,
    encrypter as never,
    'https://portal.test',
    authorizationService,
    auditService,
  );
  listActivities = new ListPortalActivitiesUseCase(activityRepo, appointmentRepo);
  forceConfirm = new ForceManualTenantConfirmationUseCase(
    appointmentRepo,
    auditService,
    authorizationService,
  );
  generateToken = new GeneratePortalTokenUseCase(
    {} as never,
    appointmentRepo,
    { findById: (id: string) => harness.prisma.tenant.findUnique({ where: { id } }) } as never,
    { mint: mintSpy } as never,
    auditService,
    'https://portal.test',
  );
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('CL_ADMIN portal actions — real Postgres tenant isolation (PR #1061)', () => {
  describe('GET portal-link', () => {
    it('returns the link for an appointment in its OWN agency', async () => {
      const result = await getPortalLink.execute({ appointmentId: seed.apptInA, actor: clAdminOfA() });
      expect(result.portalUrl).toContain('decrypted-encrypted-a');
    });

    it('refuses an appointment owned by another agency', async () => {
      await expect(
        getPortalLink.execute({ appointmentId: seed.apptInB, actor: clAdminOfA() }),
      ).rejects.toThrow(AppointmentNotFoundError);
    });
  });

  describe('GET portal-activities', () => {
    it('returns activity for an appointment in its OWN agency', async () => {
      const result = await listActivities.execute({
        appointmentId: seed.apptInA, actor: clAdminOfA(), page: 1, pageSize: 20,
      });
      expect(result.total).toBe(0); // A has no activity seeded; the point is it resolves
    });

    it('refuses an appointment owned by another agency', async () => {
      await expect(
        listActivities.execute({
          appointmentId: seed.apptInB, actor: clAdminOfA(), page: 1, pageSize: 20,
        }),
      ).rejects.toThrow('Appointment not found');
    });
  });

  describe('POST force-confirmation', () => {
    it('confirms an appointment in its OWN agency', async () => {
      const result = await forceConfirm.execute({
        appointmentId: seed.apptInA,
        rentalTenantConfirmationStatus: 'CONFIRMED',
        reason: 'Occupant confirmed by phone',
        actor: clAdminOfA(),
      });
      expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    });

    it('refuses an appointment owned by another agency and leaves the row untouched', async () => {
      await expect(
        forceConfirm.execute({
          appointmentId: seed.apptInB,
          rentalTenantConfirmationStatus: 'CONFIRMED',
          reason: 'Cross-tenant attempt',
          actor: clAdminOfA(),
        }),
      ).rejects.toThrow(AppointmentNotFoundError);

      const row = await harness.prisma.appointment.findUnique({ where: { id: seed.apptInB } });
      expect(row!.rental_tenant_confirmation_status).toBe('PENDING');
    });
  });

  describe('POST portal-token', () => {
    it('mints for an appointment in its OWN agency', async () => {
      mintSpy.mockClear();
      mintSpy.mockResolvedValueOnce({ rawToken: 'raw-a', expiresAt: new Date('2027-06-01T12:00:00Z'), tokenId: 'tok-a' });

      await generateToken.execute({ appointmentId: seed.apptInA, actor: clAdminOfA() });

      expect(mintSpy).toHaveBeenCalled();
    });

    it('refuses to mint for an appointment owned by another agency', async () => {
      mintSpy.mockClear();

      await expect(
        generateToken.execute({
          appointmentId: seed.apptInB,
          actor: { userId: 'user-a', tenantId: seed.tenantA, role: 'CL_ADMIN' },
        }),
      ).rejects.toThrow('Appointment not found');

      // The credential must never be minted — this endpoint both creates and
      // dispatches the occupant's portal access.
      expect(mintSpy).not.toHaveBeenCalled();
    });
  });
});
