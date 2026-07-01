import Fastify from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { registerPlugins } from './plugins';
import { registerRoutes } from './routes';
import { createContainer } from './container';
import { registerErrorHandler } from '../shared/interfaces/error-handler';
import { validateEnv, getEnv } from './env';
import { runWithRequestContext } from '../shared/infrastructure/request-context';
import { checkMandatoryTemplates } from '../shared/infrastructure/template-startup-check';

const SHUTDOWN_TIMEOUT_MS = 30_000;

interface ShutdownLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: unknown, msg?: string): void;
}

interface ShutdownApp {
  close(): Promise<void>;
}

export function createShutdownHandler(
  app: ShutdownApp,
  logger: ShutdownLogger,
  enableQueue: boolean,
) {
  return async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received, draining...');
    const timer = setTimeout(() => {
      logger.error({ signal }, 'Shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    try {
      await app.close();
      if (enableQueue) {
        const { stopQueue } = await import('../shared/infrastructure/queue.js');
        await stopQueue();
      }
    } catch (err) {
      logger.error(err, 'Error during shutdown');
    } finally {
      clearTimeout(timer);
      process.exit(0);
    }
  };
}

async function createApp() {
  const env = getEnv();
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      base: {
        service: 'properfy-api',
        env: env.NODE_ENV,
      },
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
  }).withTypeProvider<ZodTypeProvider>();

  await registerPlugins(app);
  registerErrorHandler(app);

  // Propagate requestId via AsyncLocalStorage for use cases and workers
  app.addHook('onRequest', (request, _reply, done) => {
    const requestId = request.id as string;
    runWithRequestContext({ requestId }, () => {
      done();
    });
  });

  const container = createContainer(app.log);
  await registerRoutes(app, container);

  return { app, container };
}

export async function buildApp() {
  // Ensure env is validated (idempotent if already called)
  validateEnv();
  const { app } = await createApp();
  return app;
}

async function start() {
  const { app, container } = await createApp();

  const env = getEnv();
  if (env.ENABLE_JOB_QUEUE === 'true') {
    const { registerWorkers } = await import('./workers.js');
    await registerWorkers(
      container.processReportJobUseCase,
      container.notification.sendNotificationUseCase,
      container.notification.pollRetryableNotificationsUseCase,
      container.notification.dispatchRemindersUseCase,
      container.notification.dispatchEscalationsUseCase,
      container.cleanupSessionsWorker,
      container.keyExpiryCheckWorker,
      container.expireFilesWorker,
      container.geocodeWorker,
      container.geocodeRetryWorker,
      container.propertyImportWorker,
      container.appointmentImportWorker,
      container.generateInvoiceFileWorker,
      container.expireTokensWorker,
      container.expireAssetsWorker,
      container.notifyStuckInspectionsWorker,
      container.expirePriorityWorker,
      container.auditRetentionWorker,
      container.rejectUnconfirmedWorker,
      app.log,
    );
  }

  // Check mandatory notification templates at startup (non-blocking)
  await checkMandatoryTemplates(app.log);

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = createShutdownHandler(app, app.log, env.ENABLE_JOB_QUEUE === 'true');
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Only start server when running directly (not in tests)
if (process.env['NODE_ENV'] !== 'test') {
  validateEnv();
  void start();
}
