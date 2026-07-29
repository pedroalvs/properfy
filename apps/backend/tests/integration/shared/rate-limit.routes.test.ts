/**
 * The HTTP rate limiter had no coverage, and it was broken: `@fastify/rate-limit`
 * THROWS whatever `errorResponseBuilder` returns (index.js:261), and its own
 * default returns an `Error` carrying `statusCode`. Ours returned a bare
 * `{ error: {...} }` object with no `statusCode`, so it fell past every branch
 * of the global error handler and became a 500 `INTERNAL_ERROR` logged as
 * "Unhandled error" — a client hitting a documented limit got what looked like
 * a server crash, and `getErrorMessage` discards >= 500 messages, so they were
 * never told to slow down.
 *
 * Own file: the limiter store is per-app-instance, so exhausting a route's
 * budget here cannot affect any other suite.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockPreviewExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: vi.fn() } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: {
      previewAppointmentImportUseCase: { execute: mockPreviewExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
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

const BRANCH_ID = 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22';
const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

/** The preview route declares the tightest documented limit: 5 per minute. */
const PREVIEW_RATE_LIMIT = 5;

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

function send() {
  mockJwtVerify.mockResolvedValueOnce(amContext);
  mockPreviewExecute.mockRejectedValueOnce(new Error('irrelevant to this test'));
  return supertest(app.server)
    .post('/v1/appointments/import/preview')
    .set('Authorization', 'Bearer valid-token')
    .field('branchId', BRANCH_ID)
    .attach('file', Buffer.from('Type,Street\nRoutine Inspection,1 Main St\n'), 'import.csv');
}

/** Sends until the limiter answers, so each test stands alone regardless of
 * order or of what a previous test already spent. */
async function sendUntilRateLimited() {
  for (let i = 0; i <= PREVIEW_RATE_LIMIT; i += 1) {
    const res = await send();
    if (res.status === 429) return res;
  }
  throw new Error(`Route was not rate limited within ${PREVIEW_RATE_LIMIT + 1} requests`);
}

describe('HTTP rate limiting', () => {
  it('answers a request over the limit with 429 and a usable envelope, not a 500', async () => {
    const res = await sendUntilRateLimited();

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.body.error.message).toMatch(/rate limit exceeded/i);
    expect(res.headers['retry-after']).toBeDefined();
  });

  /**
   * `retryAfter` must be a NUMBER OF SECONDS, matching the `Retry-After`
   * header. The web's `withRetryAfter` only parses that header when the
   * envelope omits `retryAfter`, so a human string like "1 minute" here would
   * suppress the real value — worse than sending nothing.
   */
  it('reports retryAfter as seconds, agreeing with the Retry-After header', async () => {
    const res = await sendUntilRateLimited();

    expect(res.status).toBe(429);
    expect(typeof res.body.error.retryAfter).toBe('number');
    expect(res.body.error.retryAfter).toBeGreaterThan(0);
    expect(res.body.error.retryAfter).toBe(Number(res.headers['retry-after']));
  });
});
