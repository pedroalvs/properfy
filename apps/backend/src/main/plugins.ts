import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { getEnv } from './env';
import { metrics } from '../shared/infrastructure/metrics';
import { TooManyRequestsError, ForbiddenError } from '../shared/domain/errors';

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  const env = getEnv();

  // Zod type provider compilers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // API only, no HTML
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
    },
  });

  // CORS — supports comma-separated origins in CORS_ORIGIN
  const allowedOrigins = (env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());
  await app.register(cors, {
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
  });

  // Multipart file uploads (10MB limit)
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  // Override default JSON parser to tolerate empty bodies (Content-Type: application/json
  // with no payload). Fastify's default throws FST_ERR_CTP_EMPTY_JSON_BODY in this case,
  // which maps to 500 instead of a meaningful 400. Action endpoints (deactivate, close, pay)
  // legitimately receive no body from some clients.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || body === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      const e = new Error(`Invalid JSON: ${(err as Error).message}`);
      (e as any).statusCode = 400;
      done(e, undefined);
    }
  });

  // Global rate limiting (per IP)
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    // @fastify/rate-limit THROWS whatever this returns (index.js:261), and the
    // thrown value lands in the global error handler. Returning a plain
    // `{ error: {...} }` object here is what made every rate-limited request a
    // 500 "Unhandled error": with no `statusCode` it matched none of the
    // handler's branches. Return a DomainError instead, so the handler renders
    // the envelope, honours the status, and surfaces `retryAfter`.
    errorResponseBuilder: (_request, context) => {
      // The plugin answers a banned key with 403 rather than 429 (it sets
      // `statusCode = 403` exactly when `ban` is set). No route enables `ban`
      // today; this keeps the two in step if one ever does.
      if (context.ban) {
        return new ForbiddenError(
          'RATE_LIMIT_BANNED',
          'Too many requests. Access has been temporarily blocked.',
        );
      }
      return new TooManyRequestsError(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded. Retry after ${context.after}`,
        // Seconds, matching the `Retry-After` header the plugin already set
        // (it uses the same Math.ceil(ttl / 1000)). `context.after` is a human
        // string like "1 minute" and must not go here — see TooManyRequestsError.
        Math.ceil(context.ttl / 1000),
      );
    },
  });

  // OpenAPI spec generation
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Properfy API',
        description: 'Property inspection platform API',
        version: '1.0.0',
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Development' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });

  // Swagger UI (dev/staging only)
  if (env.NODE_ENV !== 'production') {
    await app.register(fastifySwaggerUI, {
      routePrefix: '/docs',
    });
  }

  // Request ID is handled by Fastify's built-in genReqId

  // Metrics collection hooks
  const skipMetricsPaths = new Set(['/health', '/ready', '/metrics']);

  app.addHook('onRequest', (request, _reply, done) => {
    if (!skipMetricsPaths.has(request.url)) {
      (request as any).__metricsTimer = metrics.httpRequestStart();
    }
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    const timer = (request as any).__metricsTimer as (() => number) | undefined;
    if (timer) {
      const durationMs = timer();
      const route = request.routeOptions?.url ?? request.url;
      metrics.httpRequestEnd(request.method, route, reply.statusCode, durationMs);
    }
    done();
  });
}
