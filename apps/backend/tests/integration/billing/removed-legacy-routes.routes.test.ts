/**
 * 031 PR-2: The deprecated legacy `/v1/invoices/*` block and the duplicate
 * `PATCH /v1/financial/entries/:entryId/approve` route are removed. Callers use
 * the canonical `/v1/billing/invoices/*` and `POST .../approve` respectively.
 *
 * Unregistered routes must resolve to 404 (routing happens before the auth
 * preHandler, so no token is required to observe the removal).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

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
      rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
      inspectorExecution: { jwtService: { verify: mockJwtVerify } },
      billing: { jwtService: { verify: mockJwtVerify } },
      report: { jwtService: { verify: mockJwtVerify } },
      notification: { jwtService: { verify: mockJwtVerify } },
      serviceRegion: { jwtService: { verify: mockJwtVerify } },
      contact: { jwtService: { verify: mockJwtVerify } },
      appointmentTimeSlot: { jwtService: { verify: mockJwtVerify } },
      dashboard: { jwtService: { verify: mockJwtVerify } },
    } as any),
}));

const INVOICE_ID = 'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const ENTRY_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01';

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

describe('031 PR-2 — removed deprecated /v1/invoices/* routes return 404', () => {
  it.each([
    ['get', '/v1/invoices'],
    ['post', '/v1/invoices/generate'],
    ['get', `/v1/invoices/${INVOICE_ID}`],
    ['post', `/v1/invoices/${INVOICE_ID}/close`],
    ['post', `/v1/invoices/${INVOICE_ID}/pay`],
    ['get', `/v1/invoices/${INVOICE_ID}/download`],
  ])('%s %s → 404', async (method, path) => {
    const res = await (supertest(app.server) as any)[method](path).set(
      'Authorization',
      'Bearer any-token',
    );
    expect(res.status).toBe(404);
  });

  it('canonical /v1/billing/invoices path is still registered (401 without auth, not 404)', async () => {
    const res = await supertest(app.server).get('/v1/billing/invoices');
    expect(res.status).toBe(401);
  });
});

describe('031 PR-2 — removed duplicate PATCH approve returns 404', () => {
  it('PATCH /v1/financial/entries/:entryId/approve → 404', async () => {
    const res = await supertest(app.server)
      .patch(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer any-token');
    expect(res.status).toBe(404);
  });

  it('POST /v1/financial/entries/:entryId/approve is still registered (401 without auth, not 404)', async () => {
    const res = await supertest(app.server).post(`/v1/financial/entries/${ENTRY_ID}/approve`);
    expect(res.status).toBe(401);
  });
});

describe('031 PR-3 — removed orphan tenant-invoice routes return 404', () => {
  it.each([
    ['post', '/v1/billing/tenant-invoices/generate'],
    ['get', '/v1/billing/tenant-invoices'],
    ['post', `/v1/billing/tenant-invoices/${INVOICE_ID}/regenerate`],
  ])('%s %s → 404', async (method, path) => {
    const res = await (supertest(app.server) as any)[method](path).set(
      'Authorization',
      'Bearer any-token',
    );
    expect(res.status).toBe(404);
  });

  it('inspector-invoice regenerate is removed (404) — spec 032', async () => {
    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/regenerate`)
      .send({});
    expect(res.status).toBe(404);
  });
});
