import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mockBulkEditExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      auditService: { log: mockAuditLog } as any,
      auth: { jwtService: { verify: mockJwtVerify } },
      tenant: { jwtService: { verify: mockJwtVerify } },
      user: { jwtService: { verify: mockJwtVerify } },
      property: { jwtService: { verify: mockJwtVerify } },
      serviceType: { jwtService: { verify: mockJwtVerify } },
      pricingRule: { jwtService: { verify: mockJwtVerify } },
      inspector: { jwtService: { verify: mockJwtVerify } },
      appointment: {
        bulkEditAppointmentsUseCase: { execute: mockBulkEditExecute },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: {
          findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }),
        },
      },
      audit: { jwtService: { verify: mockJwtVerify } },
      serviceGroup: { jwtService: { verify: mockJwtVerify } },
      marketplace: { jwtService: { verify: mockJwtVerify } },
      rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
      inspectorExecution: { jwtService: { verify: mockJwtVerify } },
      billing: { jwtService: { verify: mockJwtVerify } },
      report: { jwtService: { verify: mockJwtVerify } },
      notification: { jwtService: { verify: mockJwtVerify } },
    }),
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const USER_ID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';

const APPT_1 = 'e1eebc00-0000-4ef8-bb6d-6bb9bd380a01';
const APPT_2 = 'e2eebc00-0000-4ef8-bb6d-6bb9bd380a02';
const APPT_3 = 'e3eebc00-0000-4ef8-bb6d-6bb9bd380a03';
const INSPECTOR_ID = 'b0eebc00-0000-4ef8-bb6d-6bb9bd380b01';
const PM_CONTACT_ID = 'c0eebc00-0000-4ef8-bb6d-6bb9bd380c01';

const amContext = {
  userId: 'admin-1',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
};
const opContext = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'OP',
  branchId: null,
  inspectorId: null,
};
const clAdminContext = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'CL_ADMIN',
  branchId: null,
  inspectorId: null,
};

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

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
// (a) Happy path: 3 rows with assignedInspectorId — all updated
// ---------------------------------------------------------------------------

describe('POST /v1/appointments/bulk-edit', () => {
  it('(a) happy path: all 3 appointments updated successfully', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockBulkEditExecute.mockResolvedValueOnce({ updated: 3, failed: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1, APPT_2, APPT_3],
        changes: { assignedInspectorId: INSPECTOR_ID },
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 3, failed: [] });
    expect(mockBulkEditExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: [APPT_1, APPT_2, APPT_3],
        changes: { assignedInspectorId: INSPECTOR_ID },
        actor: opContext,
      }),
    );
  });

  it('(a) happy path with scheduledDate change: use case called with correct payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockBulkEditExecute.mockResolvedValueOnce({ updated: 2, failed: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1, APPT_2],
        changes: { scheduledDate: '2027-08-01' },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
    expect(res.body.data.failed).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // (b) Mixed: 2 succeed + 1 fails (DONE appointment) → partial result
  // -------------------------------------------------------------------------

  it('(b) partial result: 2 updated, 1 failed (terminal status)', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockBulkEditExecute.mockResolvedValueOnce({
      updated: 2,
      failed: [
        {
          id: APPT_3,
          code: 'APPOINTMENT_UPDATE_NOT_ALLOWED',
          message: 'Cannot assign inspector on DONE appointment',
        },
      ],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1, APPT_2, APPT_3],
        changes: { assignedInspectorId: INSPECTOR_ID },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
    expect(res.body.data.failed).toHaveLength(1);
    expect(res.body.data.failed[0]).toMatchObject({
      id: APPT_3,
      code: 'APPOINTMENT_UPDATE_NOT_ALLOWED',
    });
  });

  // -------------------------------------------------------------------------
  // (c) Forbidden field `status` → whole request rejected at schema level
  // -------------------------------------------------------------------------

  it('(c) forbidden field `status` in changes → 400 VALIDATION_ERROR', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1],
        changes: { status: 'DONE' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockBulkEditExecute).not.toHaveBeenCalled();
  });

  it('(c) unknown field `notes` in changes (not in allowed set) → 400 VALIDATION_ERROR', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1],
        changes: { notes: 'some notes' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockBulkEditExecute).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // (d) 101 ids → APPOINTMENT_BULK_LIMIT_EXCEEDED (schema-level)
  // -------------------------------------------------------------------------

  it('(d) 101 ids → 400 VALIDATION_ERROR (max 100 per request)', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);

    // Generate 101 distinct valid UUIDs
    const tooManyIds = Array.from({ length: 101 }, (_, i) => {
      const hex = i.toString(16).padStart(8, '0');
      return `${hex}-0000-4000-8000-000000000000`;
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: tooManyIds,
        changes: { timeSlot: '10:00-11:00' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockBulkEditExecute).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // (e) AM/OP succeed; CL_ADMIN → 403
  // -------------------------------------------------------------------------

  it('(e) AM role succeeds', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockBulkEditExecute.mockResolvedValueOnce({ updated: 1, failed: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1],
        changes: { timeSlot: '10:00-11:00' },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);
  });

  it('(e) OP role succeeds', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockBulkEditExecute.mockResolvedValueOnce({ updated: 1, failed: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1],
        changes: { timeSlot: '10:00-11:00' },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);
  });

  it('(e) CL_ADMIN → 403 Forbidden (use case throws ForbiddenError)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    const { ForbiddenError } = await import('../../../src/shared/domain/errors');
    mockBulkEditExecute.mockRejectedValueOnce(
      new ForbiddenError('FORBIDDEN', 'Role CL_ADMIN is not permitted to perform appointment.bulk_edit'),
    );

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1],
        changes: { timeSlot: '10:00-11:00' },
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('(e) INSP → 403 Forbidden', async () => {
    const inspContext = { userId: USER_ID, tenantId: TENANT_ID, role: 'INSP', branchId: null, inspectorId: 'insp-1' };
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const { ForbiddenError } = await import('../../../src/shared/domain/errors');
    mockBulkEditExecute.mockRejectedValueOnce(
      new ForbiddenError('FORBIDDEN', 'Role INSP is not permitted to perform appointment.bulk_edit'),
    );

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1],
        changes: { timeSlot: '10:00-11:00' },
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // (f) PM contact: propertyManagerContactId → junction row created
  // -------------------------------------------------------------------------

  it('(f) PM contact change: use case called with propertyManagerContactId and returns updated=1', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockBulkEditExecute.mockResolvedValueOnce({ updated: 1, failed: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1],
        changes: { propertyManagerContactId: PM_CONTACT_ID },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);
    expect(mockBulkEditExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { propertyManagerContactId: PM_CONTACT_ID },
      }),
    );
  });

  it('(f) PM contact not found: use case returns per-row CONTACT_NOT_FOUND failure', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockBulkEditExecute.mockResolvedValueOnce({
      updated: 0,
      failed: [{ id: APPT_1, code: 'CONTACT_NOT_FOUND', message: `PM contact ${PM_CONTACT_ID} not found in tenant` }],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1],
        changes: { propertyManagerContactId: PM_CONTACT_ID },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(0);
    expect(res.body.data.failed[0]).toMatchObject({ code: 'CONTACT_NOT_FOUND' });
  });

  // -------------------------------------------------------------------------
  // (g) OP can only edit own-tenant (cross-tenant returns per-row failure)
  // -------------------------------------------------------------------------

  it('(g) OP scoped to tenant: use case receives tenantId from actor context', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockBulkEditExecute.mockResolvedValueOnce({
      updated: 0,
      failed: [{ id: APPT_1, code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found or not in tenant scope' }],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1],
        changes: { timeSlot: '10:00-11:00' },
      });

    expect(res.status).toBe(200);
    // Actor passed to use case must include tenantId from JWT (not from body)
    expect(mockBulkEditExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ tenantId: TENANT_ID, role: 'OP' }),
      }),
    );
    expect(res.body.data.failed[0]).toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('(g) AM receives null tenantId (global scope)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockBulkEditExecute.mockResolvedValueOnce({ updated: 1, failed: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1],
        changes: { timeSlot: '10:00-11:00' },
      });

    expect(res.status).toBe(200);
    expect(mockBulkEditExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ tenantId: null, role: 'AM' }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Validation: missing required fields
  // -------------------------------------------------------------------------

  it('missing `ids` field → 400 VALIDATION_ERROR', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({ changes: { timeSlot: '10:00-11:00' } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('empty `ids` array → 400 VALIDATION_ERROR', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({ ids: [], changes: { timeSlot: '10:00-11:00' } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('missing `changes` field → 400 VALIDATION_ERROR', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({ ids: [APPT_1] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('invalid UUID in ids array → 400 VALIDATION_ERROR', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: ['not-a-uuid'],
        changes: { timeSlot: '10:00-11:00' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('no auth token → 401', async () => {
    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .send({
        ids: [APPT_1],
        changes: { timeSlot: '10:00-11:00' },
      });

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Mixed changes: multiple fields in a single request
  // -------------------------------------------------------------------------

  it('multiple allowed fields combined → 200 with all fields passed to use case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockBulkEditExecute.mockResolvedValueOnce({ updated: 2, failed: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        ids: [APPT_1, APPT_2],
        changes: {
          assignedInspectorId: INSPECTOR_ID,
          scheduledDate: '2027-09-15',
          timeSlot: '09:00-10:00',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
    expect(mockBulkEditExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: {
          assignedInspectorId: INSPECTOR_ID,
          scheduledDate: '2027-09-15',
          timeSlot: '09:00-10:00',
        },
      }),
    );
  });
});
