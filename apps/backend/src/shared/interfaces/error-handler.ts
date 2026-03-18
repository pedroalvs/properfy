import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '../domain/errors';
import { ZodError } from 'zod';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
      const requestId = request.id;

      if (error instanceof DomainError) {
        const body: Record<string, unknown> = {
          error: {
            code: error.code,
            message: error.message,
          },
        };
        if (error.details) {
          (body['error'] as Record<string, unknown>)['details'] = error.details;
        }
        // Add retryAfter for rate limit errors
        if ('retryAfter' in error && error.retryAfter) {
          (body['error'] as Record<string, unknown>)['retryAfter'] = error.retryAfter;
        }
        return reply.status(error.statusCode).send(body);
      }

      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request payload is invalid',
            details: error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
      }

      // Fastify validation errors
      if ('validation' in error && error.validation) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      request.log.error({ err: error, requestId }, 'Unhandled error');

      return reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal server error occurred',
        },
      });
    },
  );
}
