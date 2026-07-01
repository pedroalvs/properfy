/**
 * T042-T044 — RBAC integration tests for self-approval prevention.
 *
 * Tests that an actor cannot approve/cross-check their own work:
 *   - Appointment cross-check by the user who set it to DONE → 403
 *   - Financial entry approval by the user who created it → 403
 *   - A different user performing the same actions → 200
 *
 * Self-approval detection is enforced by AuthorizationService.assertNotSelfApproval()
 * inside the relevant use cases.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext } from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockCrossCheck = vi.fn();
const mockApproveEntry = vi.fn();
const mockListEntries = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: {
      jwtService: { verify: mockJwtVerify },
      performCrossCheckUseCase: { execute: mockCrossCheck },
    },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: {
      jwtService: { verify: mockJwtVerify },
      approveFinancialEntryUseCase: { execute: mockApproveEntry },
      listFinancialEntriesUseCase: { execute: mockListEntries },
    },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const APPT_ID = 'c2ddfe22-2b3c-4ef9-cc7e-7cc0ce491b33';
const ENTRY_ID = 'f6eeee66-6f7e-6ef9-ee1e-1ee4ef825f77';
const ORIGINATOR_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01';
const OTHER_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02';

const apptStub = {
  id: APPT_ID,
  status: 'DONE',
  previousStatus: 'DONE',
  reason: null,
  inspectorId: null,
  doneCheckedByUserId: OTHER_USER_ID,
  doneCheckedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const entryStub = {
  id: ENTRY_ID,
  tenantId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  appointmentId: APPT_ID,
  inspectorId: null,
  entryType: 'TENANT_DEBIT',
  amount: 200,
  currency: 'AUD',
  status: 'APPROVED',
  description: 'Test',
  effectiveAt: new Date().toISOString(),
  initiatedByUserId: ORIGINATOR_USER_ID,
  approvedByUserId: OTHER_USER_ID,
  approvedAt: new Date().toISOString(),
  referenceEntryId: null,
  reason: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

// ── Appointment cross-check self-approval prevention ─────────────────────────

describe('Self-approval: appointment cross-check (POST /v1/appointments/:id/cross-check-done)', () => {
  it('actor is the originator → 403 (SELF_APPROVAL_FORBIDDEN)', async () => {
    // The actor (ORIGINATOR_USER_ID) is the same who set it to DONE
    mockJwtVerify.mockResolvedValue(makeOpContext(ORIGINATOR_USER_ID));
    mockCrossCheck.mockRejectedValue(
      new ForbiddenError('SELF_APPROVAL_FORBIDDEN', 'Cannot approve your own work'),
    );
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t')
      .send({});
    expect(res.status).toBe(403);
  });

  it('different actor → 200 (cross-check allowed)', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext(OTHER_USER_ID));
    mockCrossCheck.mockResolvedValue(apptStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t')
      .send({});
    expect(res.status).toBe(200);
  });

  it('AM as originator → 403 (even AM cannot self-approve)', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext(ORIGINATOR_USER_ID));
    mockCrossCheck.mockRejectedValue(
      new ForbiddenError('SELF_APPROVAL_FORBIDDEN', 'Cannot approve your own work'),
    );
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t')
      .send({});
    expect(res.status).toBe(403);
  });
});

// ── Financial entry approval self-approval prevention ─────────────────────────

describe('Self-approval: financial entry approval (POST /v1/financial/entries/:id/approve)', () => {
  it('actor is the entry creator → 403 (SELF_APPROVAL_FORBIDDEN)', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext(ORIGINATOR_USER_ID));
    mockApproveEntry.mockRejectedValue(
      new ForbiddenError('SELF_APPROVAL_FORBIDDEN', 'Cannot approve your own work'),
    );
    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer t')
      .send({});
    expect(res.status).toBe(403);
  });

  it('different actor approves → 200 (allowed)', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext(OTHER_USER_ID));
    mockApproveEntry.mockResolvedValue(entryStub);
    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer t')
      .send({});
    expect(res.status).toBe(200);
  });

  it('AM as originator → 403 (AM cannot self-approve financial entries)', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext(ORIGINATOR_USER_ID));
    mockApproveEntry.mockRejectedValue(
      new ForbiddenError('SELF_APPROVAL_FORBIDDEN', 'Cannot approve your own work'),
    );
    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer t')
      .send({});
    expect(res.status).toBe(403);
  });

  it('AM as different user → 200 (AM can approve others\' entries)', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext(OTHER_USER_ID));
    mockApproveEntry.mockResolvedValue(entryStub);
    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer t')
      .send({});
    expect(res.status).toBe(200);
  });
});
