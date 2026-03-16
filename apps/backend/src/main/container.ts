import { prisma } from '../shared/infrastructure/prisma';
import { AuditService } from '../shared/infrastructure/audit';
import type { Logger } from '../shared/infrastructure/logger';

// Auth module
import { PrismaUserRepository } from '../modules/auth/infrastructure/prisma-user.repository';
import { PrismaSessionRepository } from '../modules/auth/infrastructure/prisma-session.repository';
import { JwtService } from '../modules/auth/application/services/jwt.service';
import { TotpService } from '../modules/auth/application/services/totp.service';
import { LoginUseCase } from '../modules/auth/application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../modules/auth/application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../modules/auth/application/use-cases/logout.use-case';
import { GetMeUseCase } from '../modules/auth/application/use-cases/get-me.use-case';
import { ChangePasswordUseCase } from '../modules/auth/application/use-cases/change-password.use-case';
import { RevokeSessionUseCase } from '../modules/auth/application/use-cases/revoke-session.use-case';
import type { AuthRouteContainer } from '../modules/auth/interfaces/auth.routes';

// Tenant module
import { PrismaTenantRepository } from '../modules/tenant/infrastructure/prisma-tenant.repository';
import { PrismaBranchRepository } from '../modules/tenant/infrastructure/prisma-branch.repository';
import { StubAppointmentChecker } from '../modules/tenant/domain/appointment-checker';
import { CreateTenantUseCase } from '../modules/tenant/application/use-cases/create-tenant.use-case';
import { GetTenantUseCase } from '../modules/tenant/application/use-cases/get-tenant.use-case';
import { ListTenantsUseCase } from '../modules/tenant/application/use-cases/list-tenants.use-case';
import { UpdateTenantUseCase } from '../modules/tenant/application/use-cases/update-tenant.use-case';
import { DeactivateTenantUseCase } from '../modules/tenant/application/use-cases/deactivate-tenant.use-case';
import { CreateBranchUseCase } from '../modules/tenant/application/use-cases/create-branch.use-case';
import { ListBranchesUseCase } from '../modules/tenant/application/use-cases/list-branches.use-case';
import { UpdateBranchUseCase } from '../modules/tenant/application/use-cases/update-branch.use-case';
import { DeactivateBranchUseCase } from '../modules/tenant/application/use-cases/deactivate-branch.use-case';
import type { TenantRouteContainer } from '../modules/tenant/interfaces/tenant.routes';

// User module
import { PrismaUserManagementRepository } from '../modules/user/infrastructure/prisma-user-management.repository';
import { CreateUserUseCase } from '../modules/user/application/use-cases/create-user.use-case';
import { GetUserUseCase } from '../modules/user/application/use-cases/get-user.use-case';
import { ListUsersUseCase } from '../modules/user/application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from '../modules/user/application/use-cases/update-user.use-case';
import { DeactivateUserUseCase } from '../modules/user/application/use-cases/deactivate-user.use-case';
import type { UserRouteContainer } from '../modules/user/interfaces/user.routes';

// Property module
import { PrismaPropertyRepository } from '../modules/property/infrastructure/prisma-property.repository';
import { CreatePropertyUseCase } from '../modules/property/application/use-cases/create-property.use-case';
import { GetPropertyUseCase } from '../modules/property/application/use-cases/get-property.use-case';
import { ListPropertiesUseCase } from '../modules/property/application/use-cases/list-properties.use-case';
import { UpdatePropertyUseCase } from '../modules/property/application/use-cases/update-property.use-case';
import { DeletePropertyUseCase } from '../modules/property/application/use-cases/delete-property.use-case';
import type { PropertyRouteContainer } from '../modules/property/interfaces/property.routes';

// Service type module
import { PrismaServiceTypeRepository } from '../modules/service-type/infrastructure/prisma-service-type.repository';
import { CreateServiceTypeUseCase } from '../modules/service-type/application/use-cases/create-service-type.use-case';
import { GetServiceTypeUseCase } from '../modules/service-type/application/use-cases/get-service-type.use-case';
import { ListServiceTypesUseCase } from '../modules/service-type/application/use-cases/list-service-types.use-case';
import { UpdateServiceTypeUseCase } from '../modules/service-type/application/use-cases/update-service-type.use-case';
import type { ServiceTypeRouteContainer } from '../modules/service-type/interfaces/service-type.routes';

// Pricing rule module
import { PrismaPricingRuleRepository } from '../modules/pricing-rule/infrastructure/prisma-pricing-rule.repository';
import { CreatePricingRuleUseCase } from '../modules/pricing-rule/application/use-cases/create-pricing-rule.use-case';
import { ListPricingRulesUseCase } from '../modules/pricing-rule/application/use-cases/list-pricing-rules.use-case';
import { UpdatePricingRuleUseCase } from '../modules/pricing-rule/application/use-cases/update-pricing-rule.use-case';
import type { PricingRuleRouteContainer } from '../modules/pricing-rule/interfaces/pricing-rule.routes';

// Inspector module
import { PrismaInspectorRepository } from '../modules/inspector/infrastructure/prisma-inspector.repository';
import { PrismaAvailabilitySlotRepository } from '../modules/inspector/infrastructure/prisma-availability-slot.repository';
import { CreateInspectorUseCase } from '../modules/inspector/application/use-cases/create-inspector.use-case';
import { GetInspectorUseCase } from '../modules/inspector/application/use-cases/get-inspector.use-case';
import { ListInspectorsUseCase } from '../modules/inspector/application/use-cases/list-inspectors.use-case';
import { UpdateInspectorUseCase } from '../modules/inspector/application/use-cases/update-inspector.use-case';
import { CreateAvailabilitySlotUseCase } from '../modules/inspector/application/use-cases/create-availability-slot.use-case';
import { ListAvailabilitySlotsUseCase } from '../modules/inspector/application/use-cases/list-availability-slots.use-case';
import { UpdateAvailabilitySlotUseCase } from '../modules/inspector/application/use-cases/update-availability-slot.use-case';
import type { InspectorRouteContainer } from '../modules/inspector/interfaces/inspector.routes';

// Appointment module
import { PrismaAppointmentRepository } from '../modules/appointment/infrastructure/prisma-appointment.repository';
import { CreateAppointmentUseCase } from '../modules/appointment/application/use-cases/create-appointment.use-case';
import { GetAppointmentUseCase } from '../modules/appointment/application/use-cases/get-appointment.use-case';
import { ListAppointmentsUseCase } from '../modules/appointment/application/use-cases/list-appointments.use-case';
import { UpdateAppointmentUseCase } from '../modules/appointment/application/use-cases/update-appointment.use-case';
import { ExecuteStatusTransitionUseCase } from '../modules/appointment/application/use-cases/execute-status-transition.use-case';
import { ForceManualTenantConfirmationUseCase } from '../modules/appointment/application/use-cases/force-manual-confirmation.use-case';
import type { AppointmentRouteContainer } from '../modules/appointment/interfaces/appointment.routes';

export interface AppContainer {
  prisma: typeof prisma;
  auditService: AuditService;
  auth: AuthRouteContainer;
  tenant: TenantRouteContainer;
  user: UserRouteContainer;
  property: PropertyRouteContainer;
  serviceType: ServiceTypeRouteContainer;
  pricingRule: PricingRuleRouteContainer;
  inspector: InspectorRouteContainer;
  appointment: AppointmentRouteContainer;
}

export function createContainer(logger: Logger): AppContainer {
  const auditService = new AuditService(logger);

  // Repositories
  const userRepo = new PrismaUserRepository(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const tenantRepo = new PrismaTenantRepository(prisma);
  const branchRepo = new PrismaBranchRepository(prisma);
  const userManagementRepo = new PrismaUserManagementRepository(prisma);

  // Stubs (to be replaced when appointment module is built)
  const appointmentChecker = new StubAppointmentChecker();

  // Services
  const jwtPrivateKey = process.env['JWT_PRIVATE_KEY'];
  const jwtPublicKey = process.env['JWT_PUBLIC_KEY'];
  if (!jwtPrivateKey) throw new Error('Missing required environment variable: JWT_PRIVATE_KEY');
  if (!jwtPublicKey) throw new Error('Missing required environment variable: JWT_PUBLIC_KEY');

  const jwtService = new JwtService({
    privateKeyPem: jwtPrivateKey.replace(/\\n/g, '\n'),
    publicKeyPem: jwtPublicKey.replace(/\\n/g, '\n'),
    keyId: process.env['JWT_KEY_ID'] ?? 'properfy-key-v1',
    previousPublicKeyPem: process.env['JWT_PREVIOUS_PUBLIC_KEY']?.replace(/\\n/g, '\n'),
    previousKeyId: process.env['JWT_PREVIOUS_KEY_ID'],
  });
  const totpService = new TotpService();

  // Auth use cases
  const loginUseCase = new LoginUseCase(userRepo, sessionRepo, jwtService, totpService, auditService);
  const refreshTokenUseCase = new RefreshTokenUseCase(userRepo, sessionRepo, jwtService, auditService);
  const logoutUseCase = new LogoutUseCase(sessionRepo, auditService);
  const getMeUseCase = new GetMeUseCase(userRepo);
  const changePasswordUseCase = new ChangePasswordUseCase(userRepo, sessionRepo, auditService);
  const revokeSessionUseCase = new RevokeSessionUseCase(sessionRepo, auditService);

  // Tenant use cases
  const createTenantUseCase = new CreateTenantUseCase(tenantRepo, auditService);
  const getTenantUseCase = new GetTenantUseCase(tenantRepo);
  const listTenantsUseCase = new ListTenantsUseCase(tenantRepo);
  const updateTenantUseCase = new UpdateTenantUseCase(tenantRepo, auditService);
  const deactivateTenantUseCase = new DeactivateTenantUseCase(tenantRepo, appointmentChecker, auditService);
  const createBranchUseCase = new CreateBranchUseCase(tenantRepo, branchRepo, auditService);
  const listBranchesUseCase = new ListBranchesUseCase(tenantRepo, branchRepo);
  const updateBranchUseCase = new UpdateBranchUseCase(tenantRepo, branchRepo, auditService);
  const deactivateBranchUseCase = new DeactivateBranchUseCase(tenantRepo, branchRepo, appointmentChecker, auditService);

  // User use cases
  const createUserUseCase = new CreateUserUseCase(userManagementRepo, tenantRepo, branchRepo, auditService);
  const getUserUseCase = new GetUserUseCase(userManagementRepo);
  const listUsersUseCase = new ListUsersUseCase(userManagementRepo);
  const updateUserUseCase = new UpdateUserUseCase(userManagementRepo, branchRepo, auditService);
  const deactivateUserUseCase = new DeactivateUserUseCase(userManagementRepo, auditService);

  // Property repositories and use cases
  const propertyRepo = new PrismaPropertyRepository(prisma);
  const createPropertyUseCase = new CreatePropertyUseCase(propertyRepo, branchRepo, auditService);
  const getPropertyUseCase = new GetPropertyUseCase(propertyRepo);
  const listPropertiesUseCase = new ListPropertiesUseCase(propertyRepo);
  const updatePropertyUseCase = new UpdatePropertyUseCase(propertyRepo, auditService);
  const deletePropertyUseCase = new DeletePropertyUseCase(propertyRepo, auditService);

  // Service type repositories and use cases
  const serviceTypeRepo = new PrismaServiceTypeRepository(prisma);
  const createServiceTypeUseCase = new CreateServiceTypeUseCase(serviceTypeRepo, auditService);
  const getServiceTypeUseCase = new GetServiceTypeUseCase(serviceTypeRepo);
  const listServiceTypesUseCase = new ListServiceTypesUseCase(serviceTypeRepo);
  const updateServiceTypeUseCase = new UpdateServiceTypeUseCase(serviceTypeRepo, auditService);

  // Pricing rule repositories and use cases
  const pricingRuleRepo = new PrismaPricingRuleRepository(prisma);
  const createPricingRuleUseCase = new CreatePricingRuleUseCase(pricingRuleRepo, serviceTypeRepo, branchRepo, auditService);
  const listPricingRulesUseCase = new ListPricingRulesUseCase(pricingRuleRepo);
  const updatePricingRuleUseCase = new UpdatePricingRuleUseCase(pricingRuleRepo, auditService);

  // Inspector repositories and use cases
  const inspectorRepo = new PrismaInspectorRepository(prisma);
  const availabilitySlotRepo = new PrismaAvailabilitySlotRepository(prisma);
  const createInspectorUseCase = new CreateInspectorUseCase(inspectorRepo, auditService);
  const getInspectorUseCase = new GetInspectorUseCase(inspectorRepo);
  const listInspectorsUseCase = new ListInspectorsUseCase(inspectorRepo);
  const updateInspectorUseCase = new UpdateInspectorUseCase(inspectorRepo, auditService);
  const createAvailabilitySlotUseCase = new CreateAvailabilitySlotUseCase(inspectorRepo, availabilitySlotRepo, auditService);
  const listAvailabilitySlotsUseCase = new ListAvailabilitySlotsUseCase(availabilitySlotRepo);
  const updateAvailabilitySlotUseCase = new UpdateAvailabilitySlotUseCase(availabilitySlotRepo, auditService);

  // Appointment repositories and use cases
  const appointmentRepo = new PrismaAppointmentRepository(prisma);
  const createAppointmentUseCase = new CreateAppointmentUseCase(
    appointmentRepo, branchRepo, propertyRepo, serviceTypeRepo, pricingRuleRepo,
    createPropertyUseCase, auditService,
  );
  const getAppointmentUseCase = new GetAppointmentUseCase(appointmentRepo);
  const listAppointmentsUseCase = new ListAppointmentsUseCase(appointmentRepo);
  const updateAppointmentUseCase = new UpdateAppointmentUseCase(appointmentRepo, auditService);
  const executeStatusTransitionUseCase = new ExecuteStatusTransitionUseCase(
    appointmentRepo, userManagementRepo, auditService,
  );
  const forceManualConfirmationUseCase = new ForceManualTenantConfirmationUseCase(appointmentRepo, auditService);

  return {
    prisma,
    auditService,
    auth: {
      loginUseCase,
      refreshTokenUseCase,
      logoutUseCase,
      getMeUseCase,
      changePasswordUseCase,
      revokeSessionUseCase,
      jwtService,
    },
    tenant: {
      createTenantUseCase,
      getTenantUseCase,
      listTenantsUseCase,
      updateTenantUseCase,
      deactivateTenantUseCase,
      createBranchUseCase,
      listBranchesUseCase,
      updateBranchUseCase,
      deactivateBranchUseCase,
      jwtService,
    },
    user: {
      createUserUseCase,
      getUserUseCase,
      listUsersUseCase,
      updateUserUseCase,
      deactivateUserUseCase,
      jwtService,
    },
    property: {
      createPropertyUseCase,
      getPropertyUseCase,
      listPropertiesUseCase,
      updatePropertyUseCase,
      deletePropertyUseCase,
      jwtService,
    },
    serviceType: {
      createServiceTypeUseCase,
      getServiceTypeUseCase,
      listServiceTypesUseCase,
      updateServiceTypeUseCase,
      jwtService,
    },
    pricingRule: {
      createPricingRuleUseCase,
      listPricingRulesUseCase,
      updatePricingRuleUseCase,
      jwtService,
    },
    inspector: {
      createInspectorUseCase,
      getInspectorUseCase,
      listInspectorsUseCase,
      updateInspectorUseCase,
      createAvailabilitySlotUseCase,
      listAvailabilitySlotsUseCase,
      updateAvailabilitySlotUseCase,
      jwtService,
    },
    appointment: {
      createAppointmentUseCase,
      getAppointmentUseCase,
      listAppointmentsUseCase,
      updateAppointmentUseCase,
      executeStatusTransitionUseCase,
      forceManualConfirmationUseCase,
      jwtService,
    },
  };
}
