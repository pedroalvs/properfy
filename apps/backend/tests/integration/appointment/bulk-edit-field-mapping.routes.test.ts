/**
 * Integration test: bulk-edit field mapping for branchId / serviceTypeId / pricing
 *
 * Regression for QA-006-HIGH-001: update() in the appointment repository was
 * silently dropping branchId, serviceTypeId, priceAmount, payoutAmount and
 * pricingRuleSnapshotJson. The use-case sets them in updateData, but the
 * repository mapping block did not include them, so they were never persisted.
 *
 * These tests verify that:
 *  (1) The route layer accepts branchId/serviceTypeId in the changes object.
 *  (2) The repository's update() translates those camelCase fields to the
 *      correct snake_case Prisma column names via updateMany().
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';

// ---------------------------------------------------------------------------
// Shared mocks (route-level)
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
const BRANCH_ID = 'd0eebc00-0000-4ef8-bb6d-6bb9bd380d01';
const SERVICE_TYPE_ID = 'c0eebc00-0000-4ef8-bb6d-6bb9bd380c01';

const opContext = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'OP',
  branchId: null,
  inspectorId: null,
};

const amContext = {
  userId: 'admin-1',
  tenantId: null,
  role: 'AM',
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
// Part 1: Route layer — HTTP schema accepts branchId / serviceTypeId
// ---------------------------------------------------------------------------

describe('POST /v1/appointments/bulk-edit — route schema accepts field mapping fields (QA-006-HIGH-001)', () => {
  it('branchId is accepted by the schema and passed to the use-case', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockBulkEditExecute.mockResolvedValueOnce({ updated: 1, failed: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({ ids: [APPT_1], changes: { branchId: BRANCH_ID } });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);
    expect(mockBulkEditExecute).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { branchId: BRANCH_ID } }),
    );
  });

  it('serviceTypeId is accepted by the schema and passed to the use-case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockBulkEditExecute.mockResolvedValueOnce({ updated: 1, failed: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({ ids: [APPT_1], changes: { serviceTypeId: SERVICE_TYPE_ID } });

    expect(res.status).toBe(200);
    expect(mockBulkEditExecute).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { serviceTypeId: SERVICE_TYPE_ID } }),
    );
  });

  it('branchId + serviceTypeId combined are both passed to the use-case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockBulkEditExecute.mockResolvedValueOnce({ updated: 1, failed: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({ ids: [APPT_1], changes: { branchId: BRANCH_ID, serviceTypeId: SERVICE_TYPE_ID } });

    expect(res.status).toBe(200);
    expect(mockBulkEditExecute).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { branchId: BRANCH_ID, serviceTypeId: SERVICE_TYPE_ID } }),
    );
  });

  it('branchId change on non-DRAFT produces per-row failure (use-case layer)', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockBulkEditExecute.mockResolvedValueOnce({
      updated: 0,
      failed: [{ id: APPT_1, code: 'APPOINTMENT_BULK_BRANCH_CHANGE_NOT_ALLOWED', message: 'Branch change only allowed on DRAFT appointments' }],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({ ids: [APPT_1], changes: { branchId: BRANCH_ID } });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(0);
    expect(res.body.data.failed[0]).toMatchObject({ code: 'APPOINTMENT_BULK_BRANCH_CHANGE_NOT_ALLOWED' });
  });

  it('serviceTypeId with no pricing rule produces per-row APPOINTMENT_NO_PRICE_RULE failure', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockBulkEditExecute.mockResolvedValueOnce({
      updated: 0,
      failed: [{ id: APPT_1, code: 'APPOINTMENT_NO_PRICE_RULE', message: 'No active pricing rule for the new service type' }],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-edit')
      .set('Authorization', 'Bearer valid-token')
      .send({ ids: [APPT_1], changes: { serviceTypeId: SERVICE_TYPE_ID } });

    expect(res.status).toBe(200);
    expect(res.body.data.failed[0]).toMatchObject({ code: 'APPOINTMENT_NO_PRICE_RULE' });
  });
});

// ---------------------------------------------------------------------------
// Part 2: Repository — update() maps all 5 missing fields to correct DB columns
// ---------------------------------------------------------------------------

describe('PrismaAppointmentRepository.update() — missing field mappings (QA-006-HIGH-001)', () => {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = { appointment: { updateMany } } as any;

  beforeEach(() => {
    updateMany.mockClear();
  });

  it('maps branchId → branch_id in the Prisma updateMany payload', async () => {
    const repo = new PrismaAppointmentRepository(prisma);
    await repo.update('appt-1', 'tenant-1', { branchId: 'branch-new' } as any);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'appt-1', tenant_id: 'tenant-1' },
        data: expect.objectContaining({ branch_id: 'branch-new' }),
      }),
    );
  });

  it('maps branchId null → branch_id null (clearing the branch)', async () => {
    const repo = new PrismaAppointmentRepository(prisma);
    await repo.update('appt-1', 'tenant-1', { branchId: null } as any);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branch_id: null }),
      }),
    );
  });

  it('maps serviceTypeId → service_type_id in the Prisma updateMany payload', async () => {
    const repo = new PrismaAppointmentRepository(prisma);
    await repo.update('appt-1', 'tenant-1', { serviceTypeId: 'svc-type-new' } as any);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ service_type_id: 'svc-type-new' }),
      }),
    );
  });

  it('maps priceAmount → price_amount in the Prisma updateMany payload', async () => {
    const repo = new PrismaAppointmentRepository(prisma);
    await repo.update('appt-1', 'tenant-1', { priceAmount: 250 } as any);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ price_amount: 250 }),
      }),
    );
  });

  it('maps payoutAmount → payout_amount in the Prisma updateMany payload', async () => {
    const repo = new PrismaAppointmentRepository(prisma);
    await repo.update('appt-1', 'tenant-1', { payoutAmount: 120 } as any);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payout_amount: 120 }),
      }),
    );
  });

  it('maps pricingRuleSnapshotJson → pricing_rule_snapshot_json in the Prisma updateMany payload', async () => {
    const snapshot = { priceAmount: 250, payoutType: 'FIXED', payoutValue: 120 };
    const repo = new PrismaAppointmentRepository(prisma);
    await repo.update('appt-1', 'tenant-1', { pricingRuleSnapshotJson: snapshot } as any);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pricing_rule_snapshot_json: snapshot }),
      }),
    );
  });

  it('maps pricingRuleSnapshotJson null → pricing_rule_snapshot_json null', async () => {
    const repo = new PrismaAppointmentRepository(prisma);
    await repo.update('appt-1', 'tenant-1', { pricingRuleSnapshotJson: null } as any);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pricing_rule_snapshot_json: null }),
      }),
    );
  });

  it('maps all 5 new fields together correctly', async () => {
    const snapshot = { priceAmount: 300, payoutType: 'PERCENT', payoutValue: 50 };
    const repo = new PrismaAppointmentRepository(prisma);
    await repo.update('appt-1', 'tenant-1', {
      branchId: 'branch-x',
      serviceTypeId: 'svc-y',
      priceAmount: 300,
      payoutAmount: 150,
      pricingRuleSnapshotJson: snapshot,
    } as any);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branch_id: 'branch-x',
          service_type_id: 'svc-y',
          price_amount: 300,
          payout_amount: 150,
          pricing_rule_snapshot_json: snapshot,
        }),
      }),
    );
  });

  it('does not include new fields in data when they are not provided', async () => {
    const repo = new PrismaAppointmentRepository(prisma);
    // Only update timeSlot — none of the 5 new fields should appear in data
    await repo.update('appt-1', 'tenant-1', { timeSlotStart: '10:00', timeSlotEnd: '11:00' });

    const calledWith = updateMany.mock.calls[0]?.[0];
    expect(calledWith?.data).not.toHaveProperty('branch_id');
    expect(calledWith?.data).not.toHaveProperty('service_type_id');
    expect(calledWith?.data).not.toHaveProperty('price_amount');
    expect(calledWith?.data).not.toHaveProperty('payout_amount');
    expect(calledWith?.data).not.toHaveProperty('pricing_rule_snapshot_json');
  });
});
