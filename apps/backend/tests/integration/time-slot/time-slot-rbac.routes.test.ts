/**
 * QA-012-MEDIUM-001: POST/PATCH/DELETE /v1/time-slots have no RBAC guard.
 * CL_ADMIN can create/update/delete time-slot configuration, which is
 * system-level config reserved for AM and OP only.
 *
 * This test verifies:
 * 1. CL_ADMIN POST /v1/time-slots returns 403 FORBIDDEN
 * 2. CL_ADMIN PATCH /v1/time-slots/:id returns 403 FORBIDDEN
 * 3. CL_ADMIN DELETE /v1/time-slots/:id returns 403 FORBIDDEN
 * 4. AM POST /v1/time-slots returns 201 (use case is called)
 * 5. OP POST /v1/time-slots returns 201 (use case is called)
 * 6. GET /v1/time-slots remains accessible for CL_ADMIN (read-only)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockCreateTimeSlotExecute = vi.fn();
const mockUpdateTimeSlotExecute = vi.fn();
const mockDeleteTimeSlotExecute = vi.fn();
const mockListTimeSlotsExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
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
      tenantPortal: { jwtService: { verify: mockJwtVerify } },
      inspectorExecution: { jwtService: { verify: mockJwtVerify } },
      billing: { jwtService: { verify: mockJwtVerify } },
      report: { jwtService: { verify: mockJwtVerify } },
      notification: { jwtService: { verify: mockJwtVerify } },
      serviceRegion: { jwtService: { verify: mockJwtVerify } },
      contact: { jwtService: { verify: mockJwtVerify } },
      dashboard: { jwtService: { verify: mockJwtVerify } },
      appointmentTimeSlot: {
        createAppointmentTimeSlotUseCase: { execute: mockCreateTimeSlotExecute },
        updateAppointmentTimeSlotUseCase: { execute: mockUpdateTimeSlotExecute },
        deleteAppointmentTimeSlotUseCase: { execute: mockDeleteTimeSlotExecute },
        listAppointmentTimeSlotsUseCase: { execute: mockListTimeSlotsExecute },
        jwtService: { verify: mockJwtVerify },
      },
    } as any),
}));

const TENANT_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01';
const TIME_SLOT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a02';
const AM_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10';
const OP_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CL_ADMIN_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12';

const amContext = { userId: AM_USER_ID, tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: OP_USER_ID, tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: CL_ADMIN_USER_ID, tenantId: TENANT_ID, role: 'CL_ADMIN', branchId: null, inspectorId: null };

const validCreateBody = {
  label: 'Morning',
  startTime: '08:00',
  endTime: '10:00',
  sortOrder: 0,
};

const createdTimeSlot = {
  id: TIME_SLOT_ID,
  tenantId: TENANT_ID,
  branchId: null,
  label: 'Morning',
  startTime: '08:00',
  endTime: '10:00',
  sortOrder: 0,
  isActive: true,
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-24T00:00:00.000Z',
};

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// QA-012-MEDIUM-001 — POST /v1/time-slots RBAC
// ---------------------------------------------------------------------------

describe('QA-012-MEDIUM-001 — POST /v1/time-slots role enforcement', () => {
  it('CL_ADMIN receives 403 FORBIDDEN — cannot create time slots', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .post('/v1/time-slots')
      .set('Authorization', 'Bearer cl-admin-token')
      .send(validCreateBody)
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    // Use case must NOT be called — gate must stop at route layer
    expect(mockCreateTimeSlotExecute).not.toHaveBeenCalled();
  });

  it('AM receives 201 and use case is called', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreateTimeSlotExecute.mockResolvedValueOnce(createdTimeSlot);

    const res = await supertest(app.server)
      .post('/v1/time-slots')
      .set('Authorization', 'Bearer am-token')
      .send(validCreateBody)
      .expect(201);

    expect(res.body.data.id).toBe(TIME_SLOT_ID);
    expect(mockCreateTimeSlotExecute).toHaveBeenCalledOnce();
  });

  it('OP receives 201 and use case is called', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockCreateTimeSlotExecute.mockResolvedValueOnce(createdTimeSlot);

    await supertest(app.server)
      .post('/v1/time-slots')
      .set('Authorization', 'Bearer op-token')
      .send(validCreateBody)
      .expect(201);

    expect(mockCreateTimeSlotExecute).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// QA-012-MEDIUM-001 — PATCH /v1/time-slots/:id RBAC
// ---------------------------------------------------------------------------

describe('QA-012-MEDIUM-001 — PATCH /v1/time-slots/:id role enforcement', () => {
  it('CL_ADMIN receives 403 FORBIDDEN — cannot update time slots', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .patch(`/v1/time-slots/${TIME_SLOT_ID}`)
      .set('Authorization', 'Bearer cl-admin-token')
      .send({ label: 'Updated' })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockUpdateTimeSlotExecute).not.toHaveBeenCalled();
  });

  it('AM receives 200 and use case is called', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateTimeSlotExecute.mockResolvedValueOnce({ ...createdTimeSlot, label: 'Updated' });

    await supertest(app.server)
      .patch(`/v1/time-slots/${TIME_SLOT_ID}`)
      .set('Authorization', 'Bearer am-token')
      .send({ label: 'Updated' })
      .expect(200);

    expect(mockUpdateTimeSlotExecute).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// QA-012-MEDIUM-001 — DELETE /v1/time-slots/:id RBAC
// ---------------------------------------------------------------------------

describe('QA-012-MEDIUM-001 — DELETE /v1/time-slots/:id role enforcement', () => {
  it('CL_ADMIN receives 403 FORBIDDEN — cannot delete time slots', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .delete(`/v1/time-slots/${TIME_SLOT_ID}`)
      .set('Authorization', 'Bearer cl-admin-token')
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockDeleteTimeSlotExecute).not.toHaveBeenCalled();
  });

  it('AM receives 204 and use case is called', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDeleteTimeSlotExecute.mockResolvedValueOnce(undefined);

    await supertest(app.server)
      .delete(`/v1/time-slots/${TIME_SLOT_ID}`)
      .set('Authorization', 'Bearer am-token')
      .expect(204);

    expect(mockDeleteTimeSlotExecute).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/time-slots remains accessible for CL_ADMIN (read-only)
// ---------------------------------------------------------------------------

describe('GET /v1/time-slots — read-only access remains for CL_ADMIN', () => {
  it('CL_ADMIN receives 200 — read access is allowed', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockListTimeSlotsExecute.mockResolvedValueOnce([]);

    await supertest(app.server)
      .get('/v1/time-slots')
      .set('Authorization', 'Bearer cl-admin-token')
      .expect(200);

    expect(mockListTimeSlotsExecute).toHaveBeenCalledOnce();
  });
});
