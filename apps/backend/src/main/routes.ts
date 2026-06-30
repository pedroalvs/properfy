import type { FastifyInstance } from 'fastify';
import type { AppContainer } from './container';
import { metrics } from '../shared/infrastructure/metrics';
import { registerAuthRoutes } from '../modules/auth/interfaces/auth.routes';
import { registerTenantRoutes } from '../modules/tenant/interfaces/tenant.routes';
import { registerUserRoutes } from '../modules/user/interfaces/user.routes';
import { registerPropertyRoutes } from '../modules/property/interfaces/property.routes';
import { registerServiceTypeRoutes } from '../modules/service-type/interfaces/service-type.routes';
import { registerPricingRuleRoutes } from '../modules/pricing-rule/interfaces/pricing-rule.routes';
import { registerInspectorRoutes } from '../modules/inspector/interfaces/inspector.routes';
import { registerAppointmentRoutes } from '../modules/appointment/interfaces/appointment.routes';
import { registerServiceGroupRoutes } from '../modules/service-group/interfaces/service-group.routes';
import { registerMarketplaceRoutes } from '../modules/service-group/interfaces/marketplace.routes';
import { registerAuditRoutes } from '../modules/audit/interfaces/audit.routes';
import { registerAuditErasureRoutes } from '../modules/audit/interfaces/audit-erasure.routes';
import { registerAuditRetentionRoutes } from '../modules/audit/interfaces/audit-retention.routes';
import { registerTenantPortalRoutes } from '../modules/tenant-portal/interfaces/tenant-portal.routes';
import { registerInspectorExecutionRoutes } from '../modules/inspector-execution/interfaces/inspector-execution.routes';
import { registerBillingRoutes } from '../modules/billing/interfaces/billing.routes';
import { registerReportRoutes } from '../modules/report/interfaces/report.routes';
import { registerNotificationRoutes } from '../modules/notification/interfaces/notification.routes';
import { registerDashboardRoutes } from '../modules/dashboard/interfaces/dashboard.routes';
import { registerServiceRegionRoutes } from '../modules/service-region/interfaces/service-region.routes';
import { registerContactRoutes } from '../modules/contact/interfaces/http/contact.routes';
import { registerAppCredentialRoutes } from '../modules/app-credential/interfaces/http/app-credential.routes';

export async function registerRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  // Register JWT key expiry gauge for metrics endpoint
  metrics.setJwtGaugeProvider(() => container.auth.jwtService.getPreviousKeyDaysRemaining());

  // Health check with DB connectivity
  app.get('/health', async (_request, reply) => {
    const timestamp = new Date().toISOString();
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB health check timeout')), 2000),
      );
      await Promise.race([
        container.prisma.$queryRaw`SELECT 1`,
        timeoutPromise,
      ]);
      return reply.status(200).send({
        status: 'ok',
        db: 'connected',
        timestamp,
      });
    } catch {
      return reply.status(503).send({
        status: 'degraded',
        db: 'disconnected',
        timestamp,
      });
    }
  });

  // Readiness probe — checks DB + queue readiness
  app.get('/ready', async (_request, reply) => {
    const timestamp = new Date().toISOString();
    const checks: Record<string, string> = {};

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB readiness check timeout')), 2000),
      );
      await Promise.race([
        container.prisma.$queryRaw`SELECT 1`,
        timeoutPromise,
      ]);
      checks.db = 'ready';
    } catch {
      checks.db = 'not_ready';
    }

    const allReady = Object.values(checks).every((v) => v === 'ready');
    return reply.status(allReady ? 200 : 503).send({
      status: allReady ? 'ready' : 'not_ready',
      checks,
      timestamp,
    });
  });
  // Metrics endpoint — no auth, intended for internal scraping
  app.get('/metrics', async (_request, reply) => {
    return reply.status(200).send(metrics.getSnapshot());
  });

  await registerAuthRoutes(app, container.auth);
  await registerTenantRoutes(app, container.tenant);
  await registerUserRoutes(app, container.user);
  await registerPropertyRoutes(app, container.property);
  await registerServiceTypeRoutes(app, container.serviceType);
  await registerPricingRuleRoutes(app, container.pricingRule);
  await registerInspectorRoutes(app, container.inspector);
  await registerAppointmentRoutes(app, container.appointment);
  await registerServiceGroupRoutes(app, container.serviceGroup);
  await registerMarketplaceRoutes(app, container.marketplace);
  await registerAuditRoutes(app, container.audit);
  await registerAuditErasureRoutes(app, container.auditErasure);
  await registerAuditRetentionRoutes(app, container.auditRetention);
  await registerTenantPortalRoutes(app, container.tenantPortal);
  await registerInspectorExecutionRoutes(app, container.inspectorExecution);
  await registerBillingRoutes(app, container.billing);
  await registerReportRoutes(app, container.report);
  await registerNotificationRoutes(app, container.notification);
  await registerDashboardRoutes(app, container.dashboard);
  await registerServiceRegionRoutes(app, container.serviceRegion);
  await registerContactRoutes(app, container.contact);
  await registerAppCredentialRoutes(app, container.appCredential);
}
