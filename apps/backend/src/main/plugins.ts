import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Zod type provider compilers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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
  const env = process.env['NODE_ENV'] ?? 'development';
  if (env !== 'production') {
    await app.register(fastifySwaggerUI, {
      routePrefix: '/docs',
    });
  }

  // Request ID is handled by Fastify's built-in genReqId
}
