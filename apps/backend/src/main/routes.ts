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
}
