import type { FastifyBaseLogger } from 'fastify';

export type Logger = FastifyBaseLogger;

export function createChildLogger(
  logger: Logger,
  context: { requestId?: string; tenantId?: string; userId?: string },
): Logger {
  return logger.child(context) as Logger;
}
