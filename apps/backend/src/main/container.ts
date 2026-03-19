import { S3Client } from '@aws-sdk/client-s3';
import { prisma } from '../shared/infrastructure/prisma';
import type { Logger } from '../shared/infrastructure/logger';
import { getEnv } from './env';

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
import { SetupTotpUseCase } from '../modules/auth/application/use-cases/setup-totp.use-case';
import { ConfirmTotpUseCase } from '../modules/auth/application/use-cases/confirm-totp.use-case';
import { TotpEncryptionService } from '../modules/auth/infrastructure/totp-encryption.service';
import type { AuthRouteContainer } from '../modules/auth/interfaces/auth.routes';

// Tenant module
import { PrismaTenantRepository } from '../modules/tenant/infrastructure/prisma-tenant.repository';
import { PrismaBranchRepository } from '../modules/tenant/infrastructure/prisma-branch.repository';
import { PrismaAppointmentChecker } from '../modules/tenant/infrastructure/prisma-appointment-checker';
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
import { GeocodePropertyUseCase } from '../modules/property/application/use-cases/geocode-property.use-case';
import { ImportPropertiesUseCase } from '../modules/property/application/use-cases/import-properties.use-case';
import { GetPropertyImportStatusUseCase } from '../modules/property/application/use-cases/get-property-import-status.use-case';
import { MapboxGeocodingService } from '../modules/property/infrastructure/mapbox-geocoding.service';
import { StubGeocodingService } from '../modules/property/infrastructure/stub-geocoding.service';
import { PrismaPropertyImportRepository } from '../modules/property/infrastructure/prisma-property-import.repository';
import { GeocodeWorker } from '../modules/property/infrastructure/workers/geocode.worker';
import { ImportPropertyWorker } from '../modules/property/infrastructure/workers/import-property.worker';
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
import { LinkInspectorToUserUseCase } from '../modules/inspector/application/use-cases/link-inspector-to-user.use-case';
import type { InspectorRouteContainer } from '../modules/inspector/interfaces/inspector.routes';

// Audit module
import { PrismaAuditLogRepository } from '../modules/audit/infrastructure/prisma-audit-log.repository';
import { PersistentAuditService } from '../modules/audit/application/services/persistent-audit.service';
import { ListAuditLogsUseCase } from '../modules/audit/application/use-cases/list-audit-logs.use-case';
import type { AuditRouteContainer } from '../modules/audit/interfaces/audit.routes';

// Service group module
import { PrismaServiceGroupRepository } from '../modules/service-group/infrastructure/prisma-service-group.repository';
import { CreateServiceGroupUseCase } from '../modules/service-group/application/use-cases/create-service-group.use-case';
import { GetServiceGroupUseCase } from '../modules/service-group/application/use-cases/get-service-group.use-case';
import { ListServiceGroupsUseCase } from '../modules/service-group/application/use-cases/list-service-groups.use-case';
import { PublishServiceGroupUseCase } from '../modules/service-group/application/use-cases/publish-service-group.use-case';
import { AssignInspectorManuallyUseCase } from '../modules/service-group/application/use-cases/assign-inspector-manually.use-case';
import { AcceptOfferUseCase } from '../modules/service-group/application/use-cases/accept-offer.use-case';
import { GetMarketplaceOffersUseCase } from '../modules/service-group/application/use-cases/get-marketplace-offers.use-case';
import { CancelServiceGroupUseCase } from '../modules/service-group/application/use-cases/cancel-service-group.use-case';
import type { ServiceGroupRouteContainer } from '../modules/service-group/interfaces/service-group.routes';
import type { MarketplaceRouteContainer } from '../modules/service-group/interfaces/marketplace.routes';

// Tenant portal module
import { PrismaTenantPortalTokenRepository } from '../modules/tenant-portal/infrastructure/prisma-tenant-portal-token.repository';
import { PrismaTenantPortalActivityRepository } from '../modules/tenant-portal/infrastructure/prisma-tenant-portal-activity.repository';
import { TokenService } from '../modules/tenant-portal/domain/token.service';
import { GetPortalDataUseCase } from '../modules/tenant-portal/application/use-cases/get-portal-data.use-case';
import { ConfirmAppointmentUseCase } from '../modules/tenant-portal/application/use-cases/confirm-appointment.use-case';
import { RescheduleRequestUseCase } from '../modules/tenant-portal/application/use-cases/reschedule-request.use-case';
import { UpdateContactUseCase } from '../modules/tenant-portal/application/use-cases/update-contact.use-case';
import { ReportUnavailabilityUseCase } from '../modules/tenant-portal/application/use-cases/report-unavailability.use-case';
import { GeneratePortalTokenUseCase } from '../modules/tenant-portal/application/use-cases/generate-portal-token.use-case';
import type { TenantPortalRouteContainer } from '../modules/tenant-portal/interfaces/tenant-portal.routes';

// Inspector execution module
import { PrismaInspectionExecutionRepository } from '../modules/inspector-execution/infrastructure/prisma-inspection-execution.repository';
import { PrismaInspectionAssetRepository } from '../modules/inspector-execution/infrastructure/prisma-inspection-asset.repository';
import { PrismaIdempotencyService } from '../modules/inspector-execution/infrastructure/prisma-idempotency.service';
import { StubStorageService } from '../modules/inspector-execution/infrastructure/stub-storage.service';
import { SupabaseStorageService } from '../modules/inspector-execution/infrastructure/supabase-storage.service';
import { PrismaServiceTypeReader } from '../modules/inspector-execution/infrastructure/prisma-service-type-reader';
import { GetInspectorScheduleUseCase } from '../modules/inspector-execution/application/use-cases/get-inspector-schedule.use-case';
import { GetAppointmentDetailUseCase } from '../modules/inspector-execution/application/use-cases/get-appointment-detail.use-case';
import { StartInspectionUseCase } from '../modules/inspector-execution/application/use-cases/start-inspection.use-case';
import { FinishInspectionUseCase } from '../modules/inspector-execution/application/use-cases/finish-inspection.use-case';
import { RequestAssetUploadUseCase } from '../modules/inspector-execution/application/use-cases/request-asset-upload.use-case';
import { ConfirmAssetUploadUseCase } from '../modules/inspector-execution/application/use-cases/confirm-asset-upload.use-case';
import type { InspectorExecutionRouteContainer } from '../modules/inspector-execution/interfaces/inspector-execution.routes';

// Billing module
import { PrismaFinancialEntryRepository } from '../modules/billing/infrastructure/prisma-financial-entry.repository';
import { PrismaInspectorInvoiceRepository } from '../modules/billing/infrastructure/prisma-inspector-invoice.repository';
import { CreateFinancialEntriesOnDoneUseCase } from '../modules/billing/application/use-cases/create-financial-entries-on-done.use-case';
import { ListFinancialEntriesUseCase } from '../modules/billing/application/use-cases/list-financial-entries.use-case';
import { GetFinancialEntryUseCase } from '../modules/billing/application/use-cases/get-financial-entry.use-case';
import { GetFinancialSummaryUseCase } from '../modules/billing/application/use-cases/get-financial-summary.use-case';
import { ApproveFinancialEntryUseCase } from '../modules/billing/application/use-cases/approve-financial-entry.use-case';
import { CreateManualAdjustmentUseCase } from '../modules/billing/application/use-cases/create-manual-adjustment.use-case';
import { CreateRefundUseCase } from '../modules/billing/application/use-cases/create-refund.use-case';
import { GenerateInvoiceUseCase } from '../modules/billing/application/use-cases/generate-invoice.use-case';
import { ListInvoicesUseCase } from '../modules/billing/application/use-cases/list-invoices.use-case';
import { GetInvoiceUseCase } from '../modules/billing/application/use-cases/get-invoice.use-case';
import { DownloadInvoiceUseCase } from '../modules/billing/application/use-cases/download-invoice.use-case';
import type { BillingRouteContainer } from '../modules/billing/interfaces/billing.routes';

// Report module
import { PrismaReportRepository } from '../modules/report/infrastructure/prisma-report.repository';
import { StubReportStorageService } from '../modules/report/infrastructure/stub-report-storage.service';
import { SupabaseReportStorageService } from '../modules/report/infrastructure/supabase-report-storage.service';
import { ExcelJsXlsxGenerator } from '../modules/report/infrastructure/exceljs-xlsx-generator';
import { PrismaReportDataReader } from '../modules/report/infrastructure/prisma-report-data-reader';
import { StubJobQueue } from '../shared/infrastructure/stub-job-queue';
import { PgBossJobQueue } from '../shared/infrastructure/pgboss-job-queue';
import { RequestReportUseCase } from '../modules/report/application/use-cases/request-report.use-case';
import { GetReportStatusUseCase } from '../modules/report/application/use-cases/get-report-status.use-case';
import { DownloadReportUseCase } from '../modules/report/application/use-cases/download-report.use-case';
import { ListReportsUseCase } from '../modules/report/application/use-cases/list-reports.use-case';
import { ProcessReportJobUseCase } from '../modules/report/application/use-cases/process-report-job.use-case';
import type { ReportRouteContainer } from '../modules/report/interfaces/report.routes';

// Notification module
import { PrismaNotificationRepository } from '../modules/notification/infrastructure/prisma-notification.repository';
import { PrismaNotificationTemplateRepository } from '../modules/notification/infrastructure/prisma-notification-template.repository';
import { StubEmailProvider } from '../modules/notification/infrastructure/stub-email.provider';
import { ResendEmailProvider } from '../modules/notification/infrastructure/resend-email.provider';
import { StubSmsProvider } from '../modules/notification/infrastructure/stub-sms.provider';
import { TwilioSmsProvider } from '../modules/notification/infrastructure/twilio-sms.provider';
import { StubWhatsAppProvider } from '../modules/notification/infrastructure/stub-whatsapp.provider';
import { ZenviaWhatsAppProvider } from '../modules/notification/infrastructure/zenvia-whatsapp.provider';
import { TemplateRendererService } from '../modules/notification/domain/template-renderer.service';
import { SendNotificationUseCase } from '../modules/notification/application/use-cases/send-notification.use-case';
import { RetryNotificationUseCase } from '../modules/notification/application/use-cases/retry-notification.use-case';
import { HandleProviderWebhookUseCase } from '../modules/notification/application/use-cases/handle-provider-webhook.use-case';
import { ListNotificationsUseCase } from '../modules/notification/application/use-cases/list-notifications.use-case';
import { GetNotificationUseCase } from '../modules/notification/application/use-cases/get-notification.use-case';
import { UpsertNotificationTemplateUseCase } from '../modules/notification/application/use-cases/upsert-notification-template.use-case';
import { ListNotificationTemplatesUseCase } from '../modules/notification/application/use-cases/list-notification-templates.use-case';
import { CreateNotificationUseCase } from '../modules/notification/application/use-cases/create-notification.use-case';
import { PollRetryableNotificationsUseCase } from '../modules/notification/application/use-cases/poll-retryable-notifications.use-case';
import { DispatchRemindersUseCase } from '../modules/notification/application/use-cases/dispatch-reminders.use-case';
import { DispatchEscalationsUseCase } from '../modules/notification/application/use-cases/dispatch-escalations.use-case';
import type { NotificationRouteContainer } from '../modules/notification/interfaces/notification.routes';

// Notification handlers
import { NotifyOnStatusTransitionHandler } from '../modules/notification/application/handlers/notify-on-status-transition.handler';
import { NotifyOnTenantPortalActionHandler } from '../modules/notification/application/handlers/notify-on-tenant-portal-action.handler';

// Workers
import { CleanupSessionsWorker } from '../modules/auth/infrastructure/workers/cleanup-sessions.worker';
import { ExpireFilesWorker } from '../modules/report/infrastructure/workers/expire-files.worker';
import { GenerateInvoiceFileWorker } from '../modules/billing/infrastructure/workers/generate-invoice-file.worker';
import { ExpireTokensWorker } from '../modules/tenant-portal/infrastructure/workers/expire-tokens.worker';
import { ExpireAssetsWorker } from '../modules/inspector-execution/infrastructure/workers/expire-assets.worker';
import { NotifyStuckInspectionsWorker } from '../modules/inspector-execution/infrastructure/workers/notify-stuck.worker';

// Dashboard module
import { PrismaDashboardRepository } from '../modules/dashboard/infrastructure/prisma-dashboard.repository';
import { GetDashboardStatsUseCase } from '../modules/dashboard/application/use-cases/get-dashboard-stats.use-case';
import type { DashboardRouteContainer } from '../modules/dashboard/interfaces/dashboard.routes';

// Appointment module
import { PrismaAppointmentRepository } from '../modules/appointment/infrastructure/prisma-appointment.repository';
import { CreateAppointmentUseCase } from '../modules/appointment/application/use-cases/create-appointment.use-case';
import { GetAppointmentUseCase } from '../modules/appointment/application/use-cases/get-appointment.use-case';
import { ListAppointmentsUseCase } from '../modules/appointment/application/use-cases/list-appointments.use-case';
import { UpdateAppointmentUseCase } from '../modules/appointment/application/use-cases/update-appointment.use-case';
import { ExecuteStatusTransitionUseCase } from '../modules/appointment/application/use-cases/execute-status-transition.use-case';
import { ForceManualTenantConfirmationUseCase } from '../modules/appointment/application/use-cases/force-manual-confirmation.use-case';
import { ImportAppointmentsUseCase } from '../modules/appointment/application/use-cases/import-appointments.use-case';
import { GetImportStatusUseCase } from '../modules/appointment/application/use-cases/get-import-status.use-case';
import { PrismaAppointmentImportRepository } from '../modules/appointment/infrastructure/prisma-appointment-import.repository';
import { AppointmentImportWorker } from '../modules/appointment/infrastructure/workers/import.worker';
import type { AppointmentRouteContainer } from '../modules/appointment/interfaces/appointment.routes';

export interface AppContainer {
  prisma: typeof prisma;
  auditService: PersistentAuditService;
  auth: AuthRouteContainer;
  tenant: TenantRouteContainer;
  user: UserRouteContainer;
  property: PropertyRouteContainer;
  serviceType: ServiceTypeRouteContainer;
  pricingRule: PricingRuleRouteContainer;
  inspector: InspectorRouteContainer;
  appointment: AppointmentRouteContainer;
  audit: AuditRouteContainer;
  serviceGroup: ServiceGroupRouteContainer;
  marketplace: MarketplaceRouteContainer;
  tenantPortal: TenantPortalRouteContainer;
  inspectorExecution: InspectorExecutionRouteContainer;
  billing: BillingRouteContainer;
  report: ReportRouteContainer;
  notification: NotificationRouteContainer;
  dashboard: DashboardRouteContainer;
  geocodeWorker: GeocodeWorker;
  propertyImportWorker: ImportPropertyWorker;
  cleanupSessionsWorker: CleanupSessionsWorker;
  expireFilesWorker: ExpireFilesWorker;
  appointmentImportWorker: AppointmentImportWorker;
  generateInvoiceFileWorker: GenerateInvoiceFileWorker;
  expireTokensWorker: ExpireTokensWorker;
  expireAssetsWorker: ExpireAssetsWorker;
  notifyStuckInspectionsWorker: NotifyStuckInspectionsWorker;
}

export function createContainer(logger: Logger): AppContainer {
  const env = getEnv();
  const auditLogRepo = new PrismaAuditLogRepository(prisma);
  const auditService = new PersistentAuditService(auditLogRepo, logger);

  // S3 client for Supabase storage (optional — falls back to stubs when not configured)
  const s3Client = env.SUPABASE_S3_ENDPOINT && env.SUPABASE_S3_ACCESS_KEY_ID && env.SUPABASE_S3_SECRET_ACCESS_KEY
    ? new S3Client({
        endpoint: env.SUPABASE_S3_ENDPOINT,
        region: 'us-east-1',
        credentials: { accessKeyId: env.SUPABASE_S3_ACCESS_KEY_ID, secretAccessKey: env.SUPABASE_S3_SECRET_ACCESS_KEY },
        forcePathStyle: true,
      })
    : null;

  // Repositories
  const userRepo = new PrismaUserRepository(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const tenantRepo = new PrismaTenantRepository(prisma);
  const branchRepo = new PrismaBranchRepository(prisma);
  const userManagementRepo = new PrismaUserManagementRepository(prisma);

  const appointmentChecker = new PrismaAppointmentChecker(prisma);
  const inspectorRepo = new PrismaInspectorRepository(prisma);

  // Services
  const jwtService = new JwtService({
    privateKeyPem: env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    publicKeyPem: env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
    keyId: env.JWT_KEY_ID,
    previousPublicKeyPem: env.JWT_PREVIOUS_PUBLIC_KEY?.replace(/\\n/g, '\n'),
    previousKeyId: env.JWT_PREVIOUS_KEY_ID,
    previousKeyExpiresAt: env.JWT_PREVIOUS_KEY_EXPIRES_AT
      ? new Date(env.JWT_PREVIOUS_KEY_EXPIRES_AT)
      : undefined,
  });
  const totpService = new TotpService();
  // In dev/test, use a deterministic fallback key (32 bytes hex-encoded) when TOTP_ENCRYPTION_KEY is not set.
  // In staging/production, TOTP_ENCRYPTION_KEY is enforced by validateEnv().
  const totpEncryptionKey = env.TOTP_ENCRYPTION_KEY
    ?? '0000000000000000000000000000000000000000000000000000000000000000';
  const totpEncryptionService = new TotpEncryptionService(totpEncryptionKey);

  // Auth use cases
  const loginUseCase = new LoginUseCase(userRepo, sessionRepo, jwtService, totpService, auditService, inspectorRepo, totpEncryptionService);
  const refreshTokenUseCase = new RefreshTokenUseCase(userRepo, sessionRepo, jwtService, auditService, inspectorRepo);
  const logoutUseCase = new LogoutUseCase(sessionRepo, auditService);
  const getMeUseCase = new GetMeUseCase(userRepo);
  const changePasswordUseCase = new ChangePasswordUseCase(userRepo, sessionRepo, auditService);
  const revokeSessionUseCase = new RevokeSessionUseCase(sessionRepo, auditService);
  const setupTotpUseCase = new SetupTotpUseCase(userRepo, totpService, auditService, totpEncryptionService);
  const confirmTotpUseCase = new ConfirmTotpUseCase(userRepo, totpService, auditService, totpEncryptionService);

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
  const createPropertyUseCase = new CreatePropertyUseCase(propertyRepo, branchRepo, auditService, tenantRepo);
  const getPropertyUseCase = new GetPropertyUseCase(propertyRepo);
  const listPropertiesUseCase = new ListPropertiesUseCase(propertyRepo);
  const updatePropertyUseCase = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService);
  const deletePropertyUseCase = new DeletePropertyUseCase(propertyRepo, appointmentChecker, auditService);
  const geocodePropertyUseCase = new GeocodePropertyUseCase(propertyRepo);
  const geocodingService = env.MAPBOX_ACCESS_TOKEN
    ? new MapboxGeocodingService(env.MAPBOX_ACCESS_TOKEN)
    : new StubGeocodingService();
  const geocodeWorker = new GeocodeWorker(propertyRepo, geocodingService, logger);

  // Property import
  const propertyImportRepo = new PrismaPropertyImportRepository(prisma);

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

  // Inspector use cases
  const availabilitySlotRepo = new PrismaAvailabilitySlotRepository(prisma);
  const createInspectorUseCase = new CreateInspectorUseCase(inspectorRepo, auditService);
  const getInspectorUseCase = new GetInspectorUseCase(inspectorRepo);
  const listInspectorsUseCase = new ListInspectorsUseCase(inspectorRepo);
  const updateInspectorUseCase = new UpdateInspectorUseCase(inspectorRepo, auditService);
  const createAvailabilitySlotUseCase = new CreateAvailabilitySlotUseCase(inspectorRepo, availabilitySlotRepo, auditService);
  const listAvailabilitySlotsUseCase = new ListAvailabilitySlotsUseCase(availabilitySlotRepo);
  const updateAvailabilitySlotUseCase = new UpdateAvailabilitySlotUseCase(availabilitySlotRepo, auditService);
  const linkInspectorToUserUseCase = new LinkInspectorToUserUseCase(inspectorRepo, userManagementRepo, auditService);

  // Notification repositories and create use case (needed before appointments for handler wiring)
  const notificationRepo = new PrismaNotificationRepository(prisma);
  const notificationJobQueue = env.ENABLE_JOB_QUEUE === 'true'
    ? new PgBossJobQueue()
    : new StubJobQueue();
  const createNotificationUseCase = new CreateNotificationUseCase(notificationRepo, notificationJobQueue);

  // Shared idempotency service (used across modules)
  const idempotencyService = new PrismaIdempotencyService(prisma);

  // Billing repositories (needed before appointments for onDoneHandler wiring)
  const financialEntryRepo = new PrismaFinancialEntryRepository(prisma);
  const inspectorInvoiceRepo = new PrismaInspectorInvoiceRepository(prisma);

  // Appointment repositories and use cases
  const appointmentRepo = new PrismaAppointmentRepository(prisma);
  const createFinancialEntriesOnDoneUseCase = new CreateFinancialEntriesOnDoneUseCase(
    appointmentRepo, financialEntryRepo, auditService, idempotencyService, tenantRepo,
  );
  const createAppointmentUseCase = new CreateAppointmentUseCase(
    appointmentRepo, branchRepo, propertyRepo, serviceTypeRepo, pricingRuleRepo,
    createPropertyUseCase, auditService, tenantRepo,
  );
  const getAppointmentUseCase = new GetAppointmentUseCase(appointmentRepo);
  const listAppointmentsUseCase = new ListAppointmentsUseCase(appointmentRepo);
  const updateAppointmentUseCase = new UpdateAppointmentUseCase(appointmentRepo, auditService, tenantRepo);
  // Notification handlers (depend on appointmentRepo, propertyRepo, createNotificationUseCase)
  const notifyOnStatusTransitionHandler = new NotifyOnStatusTransitionHandler(
    appointmentRepo, propertyRepo, createNotificationUseCase,
  );
  const notifyOnTenantPortalActionHandler = new NotifyOnTenantPortalActionHandler(
    appointmentRepo, propertyRepo, createNotificationUseCase,
  );

  const executeStatusTransitionUseCase = new ExecuteStatusTransitionUseCase(
    appointmentRepo, userManagementRepo, inspectorRepo, idempotencyService, auditService,
    createFinancialEntriesOnDoneUseCase,
    notifyOnStatusTransitionHandler,
    tenantRepo,
    serviceTypeRepo,
  );
  const forceManualConfirmationUseCase = new ForceManualTenantConfirmationUseCase(appointmentRepo, auditService, tenantRepo);

  // Tenant portal repositories and use cases
  const tenantPortalTokenRepo = new PrismaTenantPortalTokenRepository(prisma);
  const tenantPortalActivityRepo = new PrismaTenantPortalActivityRepository(prisma);
  const tokenService = new TokenService();
  const getPortalDataUseCase = new GetPortalDataUseCase(tenantPortalTokenRepo, tenantPortalActivityRepo, appointmentRepo, propertyRepo, serviceTypeRepo);
  const confirmAppointmentUseCase = new ConfirmAppointmentUseCase(tenantPortalActivityRepo, appointmentRepo, auditService, notifyOnTenantPortalActionHandler);
  const rescheduleRequestUseCase = new RescheduleRequestUseCase(tenantPortalActivityRepo, appointmentRepo, serviceTypeRepo, auditService, notifyOnTenantPortalActionHandler);
  const updateContactUseCase = new UpdateContactUseCase(tenantPortalActivityRepo, appointmentRepo, auditService);
  const reportUnavailabilityUseCase = new ReportUnavailabilityUseCase(tenantPortalActivityRepo, appointmentRepo, auditService);
  const generatePortalTokenUseCase = new GeneratePortalTokenUseCase(tenantPortalTokenRepo, appointmentRepo, tenantRepo, tokenService, auditService, createNotificationUseCase);

  // Inspector execution repositories and services
  const inspectionExecutionRepo = new PrismaInspectionExecutionRepository(prisma);
  const inspectionAssetRepo = new PrismaInspectionAssetRepository(prisma);
  const storageService = s3Client
    ? new SupabaseStorageService(s3Client)
    : new StubStorageService();
  const serviceTypeReaderForExec = new PrismaServiceTypeReader(prisma);

  // Inspector execution use cases
  const getInspectorScheduleUseCase = new GetInspectorScheduleUseCase(
    appointmentRepo, inspectionExecutionRepo, serviceTypeReaderForExec,
  );
  const getAppointmentDetailUseCase = new GetAppointmentDetailUseCase(
    appointmentRepo, inspectionExecutionRepo, inspectionAssetRepo, serviceTypeReaderForExec,
  );
  const startInspectionUseCase = new StartInspectionUseCase(
    appointmentRepo, inspectionExecutionRepo, idempotencyService, serviceTypeReaderForExec, auditService,
  );
  const finishInspectionUseCase = new FinishInspectionUseCase(
    inspectionExecutionRepo, inspectionAssetRepo, idempotencyService,
    executeStatusTransitionUseCase, auditService, serviceTypeReaderForExec,
  );
  const requestAssetUploadUseCase = new RequestAssetUploadUseCase(
    inspectionExecutionRepo, inspectionAssetRepo, storageService, appointmentRepo,
  );
  const confirmAssetUploadUseCase = new ConfirmAssetUploadUseCase(
    inspectionAssetRepo, storageService,
  );

  // Audit use cases
  const listAuditLogsUseCase = new ListAuditLogsUseCase(auditLogRepo);

  // Service group repositories and use cases
  const serviceGroupRepo = new PrismaServiceGroupRepository(prisma);
  const createServiceGroupUseCase = new CreateServiceGroupUseCase(serviceGroupRepo, appointmentRepo, auditService);
  const getServiceGroupUseCase = new GetServiceGroupUseCase(serviceGroupRepo);
  const listServiceGroupsUseCase = new ListServiceGroupsUseCase(serviceGroupRepo);
  const publishServiceGroupUseCase = new PublishServiceGroupUseCase(serviceGroupRepo, auditService);
  const assignInspectorManuallyUseCase = new AssignInspectorManuallyUseCase(serviceGroupRepo, inspectorRepo, auditService);
  const acceptOfferUseCase = new AcceptOfferUseCase(serviceGroupRepo, inspectorRepo, auditService, idempotencyService);
  const getMarketplaceOffersUseCase = new GetMarketplaceOffersUseCase(serviceGroupRepo, inspectorRepo);
  const cancelServiceGroupUseCase = new CancelServiceGroupUseCase(serviceGroupRepo, auditService);

  // Billing use cases (repos + createFinancialEntriesOnDoneUseCase created above)
  const listFinancialEntriesUseCase = new ListFinancialEntriesUseCase(financialEntryRepo, auditService);
  const getFinancialSummaryUseCase = new GetFinancialSummaryUseCase(financialEntryRepo);
  const getFinancialEntryUseCase = new GetFinancialEntryUseCase(financialEntryRepo);
  const approveFinancialEntryUseCase = new ApproveFinancialEntryUseCase(financialEntryRepo, auditService);
  const createManualAdjustmentUseCase = new CreateManualAdjustmentUseCase(financialEntryRepo, auditService, idempotencyService, tenantRepo);
  const createRefundUseCase = new CreateRefundUseCase(financialEntryRepo, auditService, idempotencyService);
  const billingJobQueue = env.ENABLE_JOB_QUEUE === 'true'
    ? new PgBossJobQueue()
    : new StubJobQueue();
  const generateInvoiceUseCase = new GenerateInvoiceUseCase(inspectorInvoiceRepo, financialEntryRepo, auditService, billingJobQueue);
  const listInvoicesUseCase = new ListInvoicesUseCase(inspectorInvoiceRepo);
  const getInvoiceUseCase = new GetInvoiceUseCase(inspectorInvoiceRepo);
  const downloadInvoiceUseCase = new DownloadInvoiceUseCase(inspectorInvoiceRepo);

  // Report repositories and use cases
  const reportRepo = new PrismaReportRepository(prisma);
  const reportStorageService = s3Client
    ? new SupabaseReportStorageService(s3Client, env.SUPABASE_STORAGE_BUCKET)
    : new StubReportStorageService();
  const xlsxGenerator = new ExcelJsXlsxGenerator();
  const reportDataReader = new PrismaReportDataReader(prisma);
  const reportJobQueue = env.ENABLE_JOB_QUEUE === 'true'
    ? new PgBossJobQueue()
    : new StubJobQueue();
  const requestReportUseCase = new RequestReportUseCase(reportRepo, reportJobQueue, auditService, tenantRepo);
  const getReportStatusUseCase = new GetReportStatusUseCase(reportRepo, userManagementRepo);
  const downloadReportUseCase = new DownloadReportUseCase(reportRepo, reportStorageService);
  const listReportsUseCase = new ListReportsUseCase(reportRepo, userManagementRepo);
  const processReportJobUseCase = new ProcessReportJobUseCase(
    reportRepo, reportStorageService, xlsxGenerator, reportDataReader,
  );

  // Notification providers and services (notificationRepo created above)
  const notificationTemplateRepo = new PrismaNotificationTemplateRepository(prisma);
  const emailProvider = env.RESEND_API_KEY && env.RESEND_FROM_EMAIL
    ? new ResendEmailProvider(env.RESEND_API_KEY, env.RESEND_FROM_EMAIL)
    : new StubEmailProvider();

  const smsProvider = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER
    ? new TwilioSmsProvider(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_PHONE_NUMBER)
    : new StubSmsProvider();

  // WhatsApp: use Zenvia when configured, otherwise stub
  const whatsAppProvider = env.WHATSAPP_API_KEY && env.WHATSAPP_API_URL
    ? new ZenviaWhatsAppProvider(env.WHATSAPP_API_KEY, env.WHATSAPP_API_URL)
    : new StubWhatsAppProvider();
  const templateRenderer = new TemplateRendererService();

  // Notification use cases
  const sendNotificationUseCase = new SendNotificationUseCase(
    notificationRepo, notificationTemplateRepo, emailProvider, smsProvider, whatsAppProvider, templateRenderer,
  );
  const retryNotificationUseCase = new RetryNotificationUseCase(notificationRepo, auditService);
  const handleProviderWebhookUseCase = new HandleProviderWebhookUseCase(notificationRepo);
  const listNotificationsUseCase = new ListNotificationsUseCase(notificationRepo);
  const getNotificationUseCase = new GetNotificationUseCase(notificationRepo);
  const upsertNotificationTemplateUseCase = new UpsertNotificationTemplateUseCase(
    notificationTemplateRepo, templateRenderer, auditService,
  );
  const listNotificationTemplatesUseCase = new ListNotificationTemplatesUseCase(notificationTemplateRepo);
  // createNotificationUseCase and notificationJobQueue created above (before appointments)
  const pollRetryableNotificationsUseCase = new PollRetryableNotificationsUseCase(notificationRepo, notificationJobQueue);
  const dispatchRemindersUseCase = new DispatchRemindersUseCase(appointmentRepo, notificationRepo, createNotificationUseCase);
  const dispatchEscalationsUseCase = new DispatchEscalationsUseCase(appointmentRepo, branchRepo, notificationRepo, createNotificationUseCase);

  // Dashboard repositories and use cases
  const dashboardRepo = new PrismaDashboardRepository(prisma);
  const getDashboardStatsUseCase = new GetDashboardStatsUseCase(dashboardRepo);

  // Appointment import (depends on reportStorageService and job queue)
  const appointmentImportRepo = new PrismaAppointmentImportRepository(prisma);
  const importJobQueue = env.ENABLE_JOB_QUEUE === 'true'
    ? new PgBossJobQueue()
    : new StubJobQueue();
  const importAppointmentsUseCase = new ImportAppointmentsUseCase(
    appointmentImportRepo, reportStorageService, importJobQueue, idempotencyService,
  );
  const getImportStatusUseCase = new GetImportStatusUseCase(appointmentImportRepo);

  // Workers
  const cleanupSessionsWorker = new CleanupSessionsWorker(sessionRepo, logger);
  const expireFilesWorker = new ExpireFilesWorker(reportRepo, reportStorageService, logger);
  const generateInvoiceFileWorker = new GenerateInvoiceFileWorker(
    inspectorInvoiceRepo, financialEntryRepo, xlsxGenerator, reportStorageService, logger,
  );
  const expireTokensWorker = new ExpireTokensWorker(tenantPortalTokenRepo, logger);
  const expireAssetsWorker = new ExpireAssetsWorker(inspectionAssetRepo, logger);
  const notifyStuckInspectionsWorker = new NotifyStuckInspectionsWorker(
    inspectionExecutionRepo, createNotificationUseCase, logger,
  );

  const appointmentImportWorker = new AppointmentImportWorker(
    appointmentImportRepo, reportStorageService, appointmentRepo, propertyRepo, serviceTypeRepo, logger,
  );

  // Property import (depends on reportStorageService and job queue)
  const propertyImportJobQueue = env.ENABLE_JOB_QUEUE === 'true'
    ? new PgBossJobQueue()
    : new StubJobQueue();
  const importPropertiesUseCase = new ImportPropertiesUseCase(
    propertyImportRepo, reportStorageService, propertyImportJobQueue, idempotencyService,
  );
  const getPropertyImportStatusUseCase = new GetPropertyImportStatusUseCase(propertyImportRepo);
  const geocodeJobQueue = env.ENABLE_JOB_QUEUE === 'true'
    ? new PgBossJobQueue()
    : new StubJobQueue();
  const propertyImportWorker = new ImportPropertyWorker(
    propertyImportRepo, reportStorageService, propertyRepo, logger, geocodeJobQueue,
  );

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
      setupTotpUseCase,
      confirmTotpUseCase,
      jwtService,
      tenantRepo,
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
      tenantRepo,
    },
    user: {
      createUserUseCase,
      getUserUseCase,
      listUsersUseCase,
      updateUserUseCase,
      deactivateUserUseCase,
      jwtService,
      tenantRepo,
    },
    property: {
      createPropertyUseCase,
      getPropertyUseCase,
      listPropertiesUseCase,
      updatePropertyUseCase,
      deletePropertyUseCase,
      geocodePropertyUseCase,
      importPropertiesUseCase,
      getPropertyImportStatusUseCase,
      jwtService,
      tenantRepo,
    },
    serviceType: {
      createServiceTypeUseCase,
      getServiceTypeUseCase,
      listServiceTypesUseCase,
      updateServiceTypeUseCase,
      jwtService,
      tenantRepo,
    },
    pricingRule: {
      createPricingRuleUseCase,
      listPricingRulesUseCase,
      updatePricingRuleUseCase,
      jwtService,
      tenantRepo,
    },
    inspector: {
      createInspectorUseCase,
      getInspectorUseCase,
      listInspectorsUseCase,
      updateInspectorUseCase,
      createAvailabilitySlotUseCase,
      listAvailabilitySlotsUseCase,
      updateAvailabilitySlotUseCase,
      linkInspectorToUserUseCase,
      jwtService,
      tenantRepo,
    },
    appointment: {
      createAppointmentUseCase,
      getAppointmentUseCase,
      listAppointmentsUseCase,
      updateAppointmentUseCase,
      executeStatusTransitionUseCase,
      forceManualConfirmationUseCase,
      importAppointmentsUseCase,
      getImportStatusUseCase,
      jwtService,
      tenantRepo,
    },
    audit: {
      listAuditLogsUseCase,
      jwtService,
      tenantRepo,
    },
    serviceGroup: {
      createServiceGroupUseCase,
      getServiceGroupUseCase,
      listServiceGroupsUseCase,
      publishServiceGroupUseCase,
      assignInspectorManuallyUseCase,
      cancelServiceGroupUseCase,
      jwtService,
      tenantRepo,
    },
    marketplace: {
      getMarketplaceOffersUseCase,
      acceptOfferUseCase,
      jwtService,
      tenantRepo,
    },
    tenantPortal: {
      getPortalDataUseCase,
      confirmAppointmentUseCase,
      rescheduleRequestUseCase,
      updateContactUseCase,
      reportUnavailabilityUseCase,
      generatePortalTokenUseCase,
      tokenRepo: tenantPortalTokenRepo,
      tokenService,
      jwtService,
      tenantRepo,
    },
    inspectorExecution: {
      getInspectorScheduleUseCase,
      getAppointmentDetailUseCase,
      startInspectionUseCase,
      finishInspectionUseCase,
      requestAssetUploadUseCase,
      confirmAssetUploadUseCase,
      getMarketplaceOffersUseCase,
      jwtService,
      tenantRepo,
    },
    billing: {
      createFinancialEntriesOnDoneUseCase,
      getFinancialSummaryUseCase,
      listFinancialEntriesUseCase,
      getFinancialEntryUseCase,
      approveFinancialEntryUseCase,
      createManualAdjustmentUseCase,
      createRefundUseCase,
      generateInvoiceUseCase,
      listInvoicesUseCase,
      getInvoiceUseCase,
      downloadInvoiceUseCase,
      jwtService,
      tenantRepo,
    },
    report: {
      requestReportUseCase,
      getReportStatusUseCase,
      downloadReportUseCase,
      listReportsUseCase,
      processReportJobUseCase,
      jwtService,
      tenantRepo,
    },
    notification: {
      sendNotificationUseCase,
      retryNotificationUseCase,
      handleProviderWebhookUseCase,
      listNotificationsUseCase,
      getNotificationUseCase,
      upsertNotificationTemplateUseCase,
      listNotificationTemplatesUseCase,
      createNotificationUseCase,
      pollRetryableNotificationsUseCase,
      dispatchRemindersUseCase,
      dispatchEscalationsUseCase,
      jwtService,
      tenantRepo,
    },
    dashboard: {
      getDashboardStatsUseCase,
      jwtService,
      tenantRepo,
    },
    cleanupSessionsWorker,
    expireFilesWorker,
    geocodeWorker,
    propertyImportWorker,
    appointmentImportWorker,
    generateInvoiceFileWorker,
    expireTokensWorker,
    expireAssetsWorker,
    notifyStuckInspectionsWorker,
  };
}
