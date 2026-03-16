import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // API only, no HTML
  });

  // CORS
  const corsOrigin = process.env['CORS_ORIGIN'];
  if (!corsOrigin && process.env['NODE_ENV'] !== 'development') {
    throw new Error('CORS_ORIGIN environment variable is required in non-development environments');
  }
  await app.register(cors, {
    origin: corsOrigin ?? 'http://localhost:5173',
    credentials: true,
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

  // Request ID is handled by Fastify's built-in genReqId
}
