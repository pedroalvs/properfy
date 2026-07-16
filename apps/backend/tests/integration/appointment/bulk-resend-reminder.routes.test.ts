/**
 * Code-review Issues 2 + 3 — POST /v1/appointments/bulk-resend-reminder
 * route contract tests.
 *
 * Issue 2: response is wrapped in the canonical `{ data: { results: [...] } }`
 *          envelope (was bare `{ results }` pre-fix; the frontend's
 *          `useCreateMutation` reads `response.data.results` and threw on
 *          `undefined`).
 * Sydney-only platform: `actorTimezone` was removed from the request
 * schema. A legacy client still sending it must get a 2xx (the non-strict
 * Zod schema strips it) and the use case must be called WITHOUT the field.
 *
 * The use case itself is mocked here — the timezone math is exercised in
 * `tests/unit/appointment/bulk-resend-reminder.use-case.test.ts`. This
 * file pins the WIRE shape (Fastify schema + handler invocation).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockBulkResendExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    appointment: {
      bulkResendReminderUseCase: { execute: mockBulkResendExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const APPT_ID_1 = 'aaaaaaaa-0000-4000-8000-000000000010';
const APPT_ID_2 = 'aaaaaaaa-0000-4000-8000-000000000011';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };

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
  mockBulkResendExecute.mockReset();
});

describe('POST /v1/appointments/bulk-resend-reminder — envelope + Sydney-only wire', () => {
  it('returns the canonical { data: { results } } envelope (Issue 2)', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockBulkResendExecute.mockResolvedValue({
      results: [
        { appointmentId: APPT_ID_1, status: 'SENT' },
        { appointmentId: APPT_ID_2, status: 'NO_PRIMARY_CONTACT' },
      ],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-resend-reminder')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1, APPT_ID_2] });

    expect(res.status).toBe(200);
    // Pre-fix the response was bare `{ results: [...] }`; the regression
    // is asserting the `data` envelope explicitly here.
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('results');
    expect(res.body.data.results).toHaveLength(2);
    expect(res.body.data.results[0]).toEqual({ appointmentId: APPT_ID_1, status: 'SENT' });
  });

  it('strips a legacy actorTimezone field and calls the use case without it', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockBulkResendExecute.mockResolvedValue({ results: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-resend-reminder')
      .set('Authorization', 'Bearer token')
      .send({
        appointmentIds: [APPT_ID_1],
        actorTimezone: 'Australia/Sydney', // legacy field — must be ignored, not rejected
      });

    expect(res.status).toBe(200);
    expect(mockBulkResendExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentIds: [APPT_ID_1],
      }),
    );
    expect(mockBulkResendExecute.mock.calls[0]![0]).not.toHaveProperty('actorTimezone');
  });

  it('calls the use case without actorTimezone when the body omits it too', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockBulkResendExecute.mockResolvedValue({ results: [] });

    await supertest(app.server)
      .post('/v1/appointments/bulk-resend-reminder')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1] });

    const call = mockBulkResendExecute.mock.calls[0]![0];
    expect(call).not.toHaveProperty('actorTimezone');
  });

  it('rejects CL_ADMIN with 403 (AM/OP only)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-resend-reminder')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1] });

    expect(res.status).toBe(403);
    expect(mockBulkResendExecute).not.toHaveBeenCalled();
  });
});
