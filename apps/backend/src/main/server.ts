import Fastify from 'fastify';
import { registerPlugins } from './plugins';
import { registerRoutes } from './routes';
import { createContainer } from './container';
import { registerErrorHandler } from '../shared/interfaces/error-handler';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
            remoteAddress: request.ip,
          };
        },
      },
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  await registerPlugins(app);
  registerErrorHandler(app);

  const container = createContainer(app.log);
  await registerRoutes(app, container);

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only start server when running directly (not in tests)
if (process.env['NODE_ENV'] !== 'test') {
  void start();
}
