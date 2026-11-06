import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  liveDayQuerySchema,
  liveDayResponseSchema,
  lockedTimeQuerySchema,
  lockedTimeResponseSchema,
  successResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success } from '../../../shared/interfaces/response';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { GetLiveDayUseCase } from '../application/use-cases/get-live-day.use-case';
import type { GetLockedTimeUseCase } from '../application/use-cases/get-locked-time.use-case';

export interface LiveDayRouteContainer {
  getLiveDayUseCase: Pick<GetLiveDayUseCase, 'execute'>;
  getLockedTimeUseCase: Pick<GetLockedTimeUseCase, 'execute'>;
  jwtService: JwtService;
  tenantRepo: {
    findById(id: string): Promise<{ isActive(): boolean } | null>;
  };
}

/**
 * Per-user rate limit (D-R4). `@fastify/rate-limit` runs the key generator at
 * `onRequest`, before the auth middleware sets `request.authContext`, so the key
 * is the hashed `Authorization` header (never the raw token) with the client IP as
 * a fallback — one bucket per operator, not per NAT'd office. The global
 * 200/min-per-IP limiter still applies on top.
 */
function perUserRateLimit(max: number) {
  return {
    max,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      const header = request.headers.authorization;
      const value = Array.isArray(header) ? header[0] : header;
      return value ? createHash('sha256').update(value).digest('hex') : request.ip;
    },
  };
}

/**
 * Live Day routes (F05-1). Thin handlers: authenticate, validate, call the use
 * case, map the response. All RBAC, the date default/guard, the T-1 filter and
 * every derivation live in the use case. The `response` schema strips any
 * undeclared internal field (`input_fingerprint`, `alert_overrides_json`, …) as a
 * second barrier (SC-008).
 *
 * `GET/PUT /v1/inspectors/:id/alert-thresholds` (US5) live in the inspector module.
 */
export async function registerLiveDayRoutes(
  app: FastifyInstance,
  container: LiveDayRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/dashboard/live-day — 200
  app.get(
    '/v1/dashboard/live-day',
    {
      preHandler: authenticate,
      config: { rateLimit: perUserRateLimit(120) },
      schema: {
        querystring: liveDayQuerySchema,
        response: { 200: successResponseSchema(liveDayResponseSchema) },
      },
    },
    async (request, reply) => {
      const start = Date.now();
      const parsed = liveDayQuerySchema.safeParse(request.query);
      const rawQuery = request.query as { includeGeometry?: string; date?: string };
      const includeGeometry = parsed.success ? parsed.data.includeGeometry : rawQuery.includeGeometry ?? 'none';

      // FR-041: one `live_day.read` info log per request, including error paths,
      // NEVER carrying inspector coordinates or tokens (keys asserted by test 24).
      const log = (date: string | null, inspectors: number, bodyBytes: number) =>
        request.log.info(
          { date, inspectors, includeGeometry, durationMs: Date.now() - start, bodyBytes },
          'live_day.read',
        );

      try {
        if (!parsed.success) {
          throw new ValidationError('Query parameters are invalid', parsed.error.errors);
        }
        const { response } = await container.getLiveDayUseCase.execute({
          actor: request.authContext!,
          query: parsed.data,
        });
        const body = success(response);
        log(response.date, response.inspectors.length, Buffer.byteLength(JSON.stringify(body)));
        return reply.status(200).send(body);
      } catch (err) {
        log(parsed.success ? parsed.data.date ?? null : rawQuery.date ?? null, 0, 0);
        throw err;
      }
    },
  );

  // GET /v1/dashboard/locked-time — 200
  app.get(
    '/v1/dashboard/locked-time',
    {
      preHandler: authenticate,
      config: { rateLimit: perUserRateLimit(30) },
      schema: {
        querystring: lockedTimeQuerySchema,
        response: { 200: successResponseSchema(lockedTimeResponseSchema) },
      },
    },
    async (request, reply) => {
      const start = Date.now();
      const parsed = lockedTimeQuerySchema.safeParse(request.query);

      // FR-041: one `locked_time.read` info log per request (no coordinates/tokens).
      const log = (from: string | null, to: string | null, rows: number) =>
        request.log.info({ from, to, rows, durationMs: Date.now() - start }, 'locked_time.read');

      try {
        if (!parsed.success) {
          throw new ValidationError('Query parameters are invalid', parsed.error.errors);
        }
        const { response } = await container.getLockedTimeUseCase.execute({
          actor: request.authContext!,
          query: parsed.data,
        });
        log(response.from, response.to, response.byAgency.length + response.byRegion.length);
        return reply.status(200).send(success(response));
      } catch (err) {
        const raw = request.query as { from?: string; to?: string };
        log(raw.from ?? null, raw.to ?? null, 0);
        throw err;
      }
    },
  );
}
