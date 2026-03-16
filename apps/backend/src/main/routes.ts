import type { FastifyInstance } from 'fastify';
import type { AppContainer } from './container';
import { registerAuthRoutes } from '../modules/auth/interfaces/auth.routes';

export async function registerRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  await registerAuthRoutes(app, container.auth);
}
