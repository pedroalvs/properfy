/**
 * Feature 018 integration tests (mock-container based).
 *
 * These tests verify the wiring of the operator consent endpoints:
 *   - GET  /v1/notifications/consents    (AM/OP only, JSON)
 *   - POST /v1/notifications/consents/:consentId/override (AM/OP only, JSON)
 *
 * They use mocked use cases (the use cases themselves have dedicated unit tests).
 * The purpose here is to verify: route registration, auth requirements, validation,
 * HTML vs JSON response shaping, and RBAC pass-through.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { NotificationConsentNotFoundError } from '../../../src/modules/notification/domain/notification.errors';

const mockListConsents = vi.fn();
const mockOverrideConsent = vi.fn();
const mockRecordOptOut = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      notification: {
        listConsentsByRecipientUseCase: { execute: mockListConsents },
        overrideConsentUseCase: { execute: mockOverrideConsent },
        recordConsentOptOutUseCase: { execute: mockRecordOptOut },
        jwtService: { verify: mockJwtVerify },
      },
    } as any),
}));

const opActor = { userId: 'op-1', tenantId: 'tenant-1', role: 'OP', branchId: null, inspectorId: null };
const amActor = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clAdminActor = { userId: 'cl-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };

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

describe('Feature 018: operator consent endpoints', () => {
  function authHeader(actor: typeof opActor) {
    mockJwtVerify.mockResolvedValue({
      userId: actor.userId,
      tenantId: actor.tenantId,
      role: actor.role,
      branchId: actor.branchId,
      inspectorId: actor.inspectorId,
      email: 'user@test.com',
    });
    return { Authorization: 'Bearer mock-token' };
  }

  describe('GET /v1/notifications/consents', () => {
    it('returns list + skippedCount for OP', async () => {
      mockListConsents.mockResolvedValue({
        recipient: 'user@example.com',
        entries: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            recipient: 'user@example.com',
            channel: 'EMAIL',
            tenantId: 'tenant-1',
            notificationClass: 'OPERATIONAL',
            optedOut: true,
            optedOutAt: new Date('2026-04-01T00:00:00Z'),
            changeSource: 'operator_override',
            changedAt: new Date('2026-04-01T00:00:00Z'),
            changedByUserId: null,
            reason: null,
            createdAt: new Date('2026-04-01T00:00:00Z'),
            updatedAt: new Date('2026-04-01T00:00:00Z'),
          },
        ],
        skippedCount: 5,
      });

      const response = await supertest(app.server)
        .get('/v1/notifications/consents?recipient=user@example.com')
        .set(authHeader(opActor))
        .expect(200);

      expect(response.body.data.entries).toHaveLength(1);
      expect(response.body.data.skippedCount).toBe(5);
    });

    it('returns 403 for CL_ADMIN (authorization service enforces)', async () => {
      mockListConsents.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Role CL_ADMIN is not permitted'));

      await supertest(app.server)
        .get('/v1/notifications/consents?recipient=user@example.com')
        .set(authHeader(clAdminActor))
        .expect(403);
    });

    it('returns 400 when recipient query param is missing', async () => {
      await supertest(app.server)
        .get('/v1/notifications/consents')
        .set(authHeader(opActor))
        .expect(400);
    });

    it('returns 401 without auth', async () => {
      await supertest(app.server)
        .get('/v1/notifications/consents?recipient=user@example.com')
        .expect(401);
    });
  });

  describe('POST /v1/notifications/consents/:consentId/override', () => {
    it('returns 200 with updated record on happy path', async () => {
      mockOverrideConsent.mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000001',
        recipient: 'user@example.com',
        channel: 'EMAIL',
        tenantId: 'tenant-1',
        notificationClass: 'OPERATIONAL',
        optedOut: false,
        optedOutAt: null,
        changeSource: 'operator_override',
        changedAt: new Date('2026-04-09T00:00:00Z'),
        changedByUserId: 'op-1',
        reason: 'User called in',
        createdAt: new Date('2026-04-01T00:00:00Z'),
        updatedAt: new Date('2026-04-09T00:00:00Z'),
      });

      const response = await supertest(app.server)
        .post('/v1/notifications/consents/00000000-0000-0000-0000-000000000001/override')
        .set(authHeader(opActor))
        .send({ reason: 'User called in' })
        .expect(200);

      expect(response.body.data.optedOut).toBe(false);
      expect(response.body.data.changeSource).toBe('operator_override');
      expect(mockOverrideConsent).toHaveBeenCalledWith(
        expect.objectContaining({
          consentId: '00000000-0000-0000-0000-000000000001',
          reason: 'User called in',
        }),
      );
    });

    it('returns 400 when reason is missing', async () => {
      await supertest(app.server)
        .post('/v1/notifications/consents/00000000-0000-0000-0000-000000000001/override')
        .set(authHeader(opActor))
        .send({})
        .expect(400);
    });

    it('returns 400 on invalid consentId', async () => {
      await supertest(app.server)
        .post('/v1/notifications/consents/not-a-uuid/override')
        .set(authHeader(opActor))
        .send({ reason: 'valid reason' })
        .expect(400);
    });

    it('returns 404 when consent record does not exist', async () => {
      mockOverrideConsent.mockRejectedValue(new NotificationConsentNotFoundError());

      await supertest(app.server)
        .post('/v1/notifications/consents/00000000-0000-0000-0000-000000000001/override')
        .set(authHeader(opActor))
        .send({ reason: 'valid reason' })
        .expect(404);
    });

    it('returns 403 for CL_ADMIN', async () => {
      mockOverrideConsent.mockRejectedValue(
        new ForbiddenError('FORBIDDEN', 'Role CL_ADMIN is not permitted'),
      );

      await supertest(app.server)
        .post('/v1/notifications/consents/00000000-0000-0000-0000-000000000001/override')
        .set(authHeader(clAdminActor))
        .send({ reason: 'valid reason' })
        .expect(403);
    });

    it('allows AM to override', async () => {
      mockOverrideConsent.mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000001',
        recipient: 'user@example.com',
        channel: 'EMAIL',
        tenantId: 'tenant-7',
        notificationClass: 'OPERATIONAL',
        optedOut: false,
        optedOutAt: null,
        changeSource: 'operator_override',
        changedAt: new Date(),
        changedByUserId: 'am-1',
        reason: 'AM override',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await supertest(app.server)
        .post('/v1/notifications/consents/00000000-0000-0000-0000-000000000001/override')
        .set(authHeader(amActor))
        .send({ reason: 'AM override' })
        .expect(200);

      expect(response.body.data.optedOut).toBe(false);
    });
  });

  // F06 L-F06-03: manual opt-out endpoint
  describe('POST /v1/notifications/consents/opt-out', () => {
    const validBody = {
      tenantId: '00000000-0000-0000-0000-000000000007',
      recipient: '+61412000001',
      channel: 'SMS',
      reason: 'Tenant asked to stop SMS',
    };
    const optedOutRecord = {
      id: '00000000-0000-0000-0000-000000000009',
      recipient: '+61412000001',
      channel: 'SMS',
      tenantId: '00000000-0000-0000-0000-000000000007',
      notificationClass: 'OPERATIONAL',
      optedOut: true,
      optedOutAt: new Date(),
      changeSource: 'operator_override',
      changedAt: new Date(),
      changedByUserId: 'am-1',
      reason: 'Tenant asked to stop SMS',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns 200 with the opted-out record for AM', async () => {
      mockRecordOptOut.mockResolvedValue(optedOutRecord);
      const response = await supertest(app.server)
        .post('/v1/notifications/consents/opt-out')
        .set(authHeader(amActor))
        .send(validBody)
        .expect(200);
      expect(response.body.data.optedOut).toBe(true);
      expect(response.body.data.changeSource).toBe('operator_override');
    });

    it('returns 401 without auth', async () => {
      await supertest(app.server).post('/v1/notifications/consents/opt-out').send(validBody).expect(401);
      expect(mockRecordOptOut).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid body (bad channel)', async () => {
      await supertest(app.server)
        .post('/v1/notifications/consents/opt-out')
        .set(authHeader(amActor))
        .send({ ...validBody, channel: 'PUSH' })
        .expect(400);
      expect(mockRecordOptOut).not.toHaveBeenCalled();
    });

    it('returns 400 for an empty reason', async () => {
      await supertest(app.server)
        .post('/v1/notifications/consents/opt-out')
        .set(authHeader(amActor))
        .send({ ...validBody, reason: '   ' })
        .expect(400);
    });

    it('rejects CL_ADMIN (403, same matrix as override)', async () => {
      mockRecordOptOut.mockRejectedValue(new ForbiddenError('forbidden'));
      await supertest(app.server)
        .post('/v1/notifications/consents/opt-out')
        .set(authHeader(clAdminActor))
        .send(validBody)
        .expect(403);
    });
  });
});
