/**
 * GET /v1/appointments/:appointmentId/portal-activities route contract test.
 *
 * Why this file exists: the route binds `portalActivitiesResponseSchema` as its 200
 * response, and fastify-type-provider-zod's serializerCompiler hard-parses the payload
 * AFTER the handler returns. A field renamed on the use-case side but not in the schema
 * therefore surfaces as an opaque 500 that no unit test can see — the use-case test calls
 * the class directly and never touches the serializer.
 *
 * So the happy-path cases here feed the route the output of the REAL
 * ListPortalActivitiesUseCase (stub repositories, real mapping) rather than a hand-written
 * literal. A payload typed by hand would only ever assert what the test author typed;
 * routing the real mapping through the real serializer is what makes this a regression
 * guard for the whole contract.
 *
 * Uses mock-container + supertest, consistent with the other route tests in this project.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ListPortalActivitiesUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/list-portal-activities.use-case';
import { RentalTenantPortalActivityEntity } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-activity.entity';
import { NotFoundError, ForbiddenError } from '../../../src/shared/domain/errors';

const mockListPortalActivitiesExecute = vi.fn();
const mockJwtVerify = vi.fn();

const APPOINTMENT_ID = 'a0000000-0000-4000-8000-000000000001';
const TOKEN_ID = 'b0000000-0000-4000-8000-000000000002';
const ACTIVITY_ID = 'c0000000-0000-4000-8000-000000000003';

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: {
      jwtService: { verify: mockJwtVerify },
      listPortalActivitiesUseCase: { execute: mockListPortalActivitiesExecute },
    },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const AM_ACTOR = { userId: 'user-am', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const OP_ACTOR = { userId: 'user-op', tenantId: 'tenant-1', role: 'OP', branchId: null, inspectorId: null };
const CL_ADMIN_ACTOR = { userId: 'user-cl', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };
const INSP_ACTOR = { userId: 'user-insp', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'insp-1' };

/**
 * Runs the real use case over stub repositories and returns its real output, so the
 * route serializes exactly what production would hand it.
 */
async function realUseCaseOutput(
  activities: RentalTenantPortalActivityEntity[],
): Promise<unknown> {
  const activityRepo = {
    save: vi.fn(),
    findLatestByTokenAndAction: vi.fn(),
    findByAppointmentId: vi.fn().mockResolvedValue({ activities, total: activities.length }),
  };
  const appointmentRepo = {
    findById: vi.fn().mockResolvedValue({ appointment: { id: APPOINTMENT_ID, tenantId: 'tenant-1' } }),
  };
  const useCase = new ListPortalActivitiesUseCase(activityRepo as any, appointmentRepo as any);
  return useCase.execute({
    appointmentId: APPOINTMENT_ID,
    actor: { userId: 'user-am', tenantId: null, role: 'AM', branchId: null, inspectorId: null } as any,
    page: 1,
    pageSize: 20,
  });
}

function buildActivity(
  overrides: Partial<ConstructorParameters<typeof RentalTenantPortalActivityEntity>[0]> = {},
): RentalTenantPortalActivityEntity {
  return new RentalTenantPortalActivityEntity({
    id: overrides.id ?? ACTIVITY_ID,
    appointmentId: overrides.appointmentId ?? APPOINTMENT_ID,
    rentalTenantPortalTokenId: overrides.rentalTenantPortalTokenId ?? TOKEN_ID,
    action: overrides.action ?? 'VIEW',
    previousValuesJson: overrides.previousValuesJson ?? null,
    newValuesJson: overrides.newValuesJson ?? null,
    ipAddress: overrides.ipAddress ?? '203.0.113.7',
    userAgent: overrides.userAgent ?? 'Mozilla/5.0',
    createdAt: overrides.createdAt ?? new Date('2026-04-01T10:00:00Z'),
  });
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('GET /v1/appointments/:appointmentId/portal-activities', () => {
  describe('200 — non-empty list', () => {
    it('serializes real use-case output for AM actor', async () => {
      mockJwtVerify.mockResolvedValueOnce(AM_ACTOR);
      mockListPortalActivitiesExecute.mockResolvedValueOnce(
        await realUseCaseOutput([buildActivity({ action: 'CONFIRM' })]),
      );

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-activities`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].action).toBe('CONFIRM');
      expect(res.body.data[0].createdAt).toBe('2026-04-01T10:00:00.000Z');
    });

    it('preserves every field the schema declares, including the portal token id', async () => {
      mockJwtVerify.mockResolvedValueOnce(AM_ACTOR);
      mockListPortalActivitiesExecute.mockResolvedValueOnce(
        await realUseCaseOutput([
          buildActivity({
            action: 'GROUP_JOIN',
            newValuesJson: { scheduledDate: '2026-04-02', timeSlot: '09:00 - 12:00' },
          }),
        ]),
      );

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-activities`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      // The serializer strips unknown keys, so an absent value here means the schema and
      // the use case have drifted apart again.
      expect(res.body.data[0].rentalTenantPortalTokenId).toBe(TOKEN_ID);
      expect(res.body.data[0].appointmentId).toBe(APPOINTMENT_ID);
      expect(res.body.data[0].ipAddress).toBe('203.0.113.7');
      expect(res.body.data[0].newValuesJson).toEqual({
        scheduledDate: '2026-04-02',
        timeSlot: '09:00 - 12:00',
      });
    });

    it('serializes every action type the portal can record', async () => {
      const actions = ['VIEW', 'CONFIRM', 'RESCHEDULE', 'CONTACT_UPDATED', 'UNAVAILABLE_REPORTED', 'GROUP_JOIN'] as const;
      mockJwtVerify.mockResolvedValueOnce(AM_ACTOR);
      mockListPortalActivitiesExecute.mockResolvedValueOnce(
        await realUseCaseOutput(
          actions.map((action, i) =>
            buildActivity({ id: `c0000000-0000-4000-8000-00000000001${i}`, action }),
          ),
        ),
      );

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-activities`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.map((a: { action: string }) => a.action)).toEqual([...actions]);
    });
  });

  describe('200 — empty list', () => {
    it('returns an empty page for an appointment with no portal interactions', async () => {
      mockJwtVerify.mockResolvedValueOnce(OP_ACTOR);
      mockListPortalActivitiesExecute.mockResolvedValueOnce(await realUseCaseOutput([]));

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-activities`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  describe('403 — role not allowed', () => {
    it.each([
      ['CL_ADMIN', CL_ADMIN_ACTOR],
      ['INSP', INSP_ACTOR],
    ])('returns 403 FORBIDDEN for %s actor', async (_label, actor) => {
      mockJwtVerify.mockResolvedValueOnce(actor);
      mockListPortalActivitiesExecute.mockRejectedValueOnce(
        new ForbiddenError('FORBIDDEN', 'Only AM and OP roles can view portal activities'),
      );

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-activities`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('404 — appointment out of tenant scope', () => {
    it('returns 404 APPOINTMENT_NOT_FOUND when OP queries a cross-tenant appointment', async () => {
      mockJwtVerify.mockResolvedValueOnce(OP_ACTOR);
      mockListPortalActivitiesExecute.mockRejectedValueOnce(
        new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found'),
      );

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-activities`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('APPOINTMENT_NOT_FOUND');
    });
  });
});
