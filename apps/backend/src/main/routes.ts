import type { FastifyInstance } from 'fastify';
import type { AppContainer } from './container';
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
import { registerTenantPortalRoutes } from '../modules/tenant-portal/interfaces/tenant-portal.routes';
import { registerInspectorExecutionRoutes } from '../modules/inspector-execution/interfaces/inspector-execution.routes';
import { registerBillingRoutes } from '../modules/billing/interfaces/billing.routes';

export async function registerRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
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
  await registerTenantPortalRoutes(app, container.tenantPortal);
  await registerInspectorExecutionRoutes(app, container.inspectorExecution);
  await registerBillingRoutes(app, container.billing);
}
