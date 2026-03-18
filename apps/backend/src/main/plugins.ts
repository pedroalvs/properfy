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

  // CORS
  await app.register(cors, {
    origin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  // Multipart file uploads (10MB limit)
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  // Global rate limiting (per IP)
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Retry after ${context.after}`,
      },
    }),
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
