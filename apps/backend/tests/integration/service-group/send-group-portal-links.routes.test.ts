/**
 * Route contract tests for the group "Send portal link" endpoints:
 *   - GET  /v1/service-groups/:groupId/portal-link-plan (preview)
 *   - POST /v1/service-groups/:groupId/portal-links       (send)
 *
 * The use cases are mocked (their behaviour is covered by the unit tests at
 * tests/unit/service-group/*.use-case.test.ts). This file pins the WIRE shape:
 * Fastify schema, RBAC (AM/OP only), the canonical `{ data: ... }` envelope,
 * and that a legacy `actorTimezone` body field is stripped (Sydney-only platform).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockPlanExecute = vi.fn();
const mockSendExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    serviceGroup: {
      getGroupPortalLinkPlanUseCase: { execute: mockPlanExecute },
      sendGroupPortalLinksUseCase: { execute: mockSendExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
  }),
}));

const GROUP_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const APPT_ID = 'aaaaaaaa-0000-4000-8000-000000000010';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-1', tenantId: 'tenant-a', role: 'CL_ADMIN', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => {
  vi.clearAllMocks();
  mockJwtVerify.mockReset();
  mockPlanExecute.mockReset();
  mockSendExecute.mockReset();
});

describe('GET /v1/service-groups/:groupId/portal-link-plan', () => {
  it('returns the preview wrapped in the { data } envelope', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockPlanExecute.mockResolvedValue({
      items: [{ appointmentId: APPT_ID, appointmentNumber: 1, propertyCode: 'P-001', plannedAction: 'SEND' }],
      summary: { total: 1, willSend: 1, willResendDateChanged: 0, alreadyConfirmed: 0, notSendable: 0 },
    });

    const res = await supertest(app.server)
      .get(`/v1/service-groups/${GROUP_ID}/portal-link-plan`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.willSend).toBe(1);
    expect(res.body.data.items).toHaveLength(1);
    expect(mockPlanExecute).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_ID, actor: expect.objectContaining({ role: 'AM' }) }),
    );
  });

  it('rejects CL_ADMIN with 403', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    const res = await supertest(app.server)
      .get(`/v1/service-groups/${GROUP_ID}/portal-link-plan`)
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
    expect(mockPlanExecute).not.toHaveBeenCalled();
  });
});

describe('POST /v1/service-groups/:groupId/portal-links', () => {
  it('returns the canonical { data: { results } } envelope', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockSendExecute.mockResolvedValue({
      results: [
        { appointmentId: APPT_ID, status: 'SENT' },
        { appointmentId: APPT_ID, status: 'ALREADY_CONFIRMED' },
      ],
    });

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/portal-links`)
      .set('Authorization', 'Bearer token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.results).toHaveLength(2);
    expect(res.body.data.results[0]).toEqual({ appointmentId: APPT_ID, status: 'SENT' });
  });

  it('strips a legacy actorTimezone field and calls the use case without it', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockSendExecute.mockResolvedValue({ results: [] });

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/portal-links`)
      .set('Authorization', 'Bearer token')
      .send({ actorTimezone: 'Australia/Sydney' }); // legacy field — must be ignored, not rejected

    expect(res.status).toBe(200);
    expect(mockSendExecute).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_ID }),
    );
    expect(mockSendExecute.mock.calls[0]![0]).not.toHaveProperty('actorTimezone');
  });

  it('calls the use case without actorTimezone when the body omits it too', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockSendExecute.mockResolvedValue({ results: [] });

    await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/portal-links`)
      .set('Authorization', 'Bearer token')
      .send({});

    expect(mockSendExecute.mock.calls[0]![0]).not.toHaveProperty('actorTimezone');
  });

  it('rejects CL_ADMIN with 403 (AM/OP only)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/portal-links`)
      .set('Authorization', 'Bearer token')
      .send({});

    expect(res.status).toBe(403);
    expect(mockSendExecute).not.toHaveBeenCalled();
  });
});
