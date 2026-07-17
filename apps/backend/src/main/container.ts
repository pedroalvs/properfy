import { S3Client } from '@aws-sdk/client-s3';
import { prisma } from '../shared/infrastructure/prisma';
import type { Logger } from '../shared/infrastructure/logger';
import { metrics } from '../shared/infrastructure/metrics';
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
import { ListSessionsUseCase } from '../modules/auth/application/use-cases/list-sessions.use-case';
import { SetupTotpUseCase } from '../modules/auth/application/use-cases/setup-totp.use-case';
import { ConfirmTotpUseCase } from '../modules/auth/application/use-cases/confirm-totp.use-case';
import { TotpEncryptionService } from '../modules/auth/infrastructure/totp-encryption.service';
import { SessionTrustService } from '../modules/auth/application/services/session-trust.service';
import { StubGeoIpService } from '../shared/infrastructure/geoip.service';
import { RequestPasswordResetUseCase } from '../modules/auth/application/use-cases/request-password-reset.use-case';
import { ConsumePasswordResetUseCase } from '../modules/auth/application/use-cases/consume-password-reset.use-case';
import { AcceptInviteUseCase } from '../modules/auth/application/use-cases/accept-invite.use-case';
import { PrismaPasswordResetTokenRepository } from '../modules/auth/infrastructure/prisma-password-reset-token.repository';
import { PrismaPasswordHistoryRepository } from '../modules/auth/infrastructure/prisma-password-history.repository';
import type { AuthRouteContainer } from '../modules/auth/interfaces/auth.routes';

// Domain event bus
import { DomainEventBus } from '../shared/application/events/domain-event-bus';

// Tenant module
import { PrismaTenantRepository } from '../modules/tenant/infrastructure/prisma-tenant.repository';
import { PrismaBranchRepository } from '../modules/tenant/infrastructure/prisma-branch.repository';
import { PrismaAppointmentChecker } from '../modules/tenant/infrastructure/prisma-appointment-checker';
import { CreateTenantUseCase } from '../modules/tenant/application/use-cases/create-tenant.use-case';
import { GetTenantUseCase } from '../modules/tenant/application/use-cases/get-tenant.use-case';
import { ListTenantsUseCase } from '../modules/tenant/application/use-cases/list-tenants.use-case';
import { UpdateTenantUseCase } from '../modules/tenant/application/use-cases/update-tenant.use-case';
import { ActivateTenantUseCase } from '../modules/tenant/application/use-cases/activate-tenant.use-case';
import { DeactivateTenantUseCase } from '../modules/tenant/application/use-cases/deactivate-tenant.use-case';
import { CreateBranchUseCase } from '../modules/tenant/application/use-cases/create-branch.use-case';
import { GetBranchUseCase } from '../modules/tenant/application/use-cases/get-branch.use-case';
import { ListBranchesUseCase } from '../modules/tenant/application/use-cases/list-branches.use-case';
import { UpdateBranchUseCase } from '../modules/tenant/application/use-cases/update-branch.use-case';
import { DeactivateBranchUseCase } from '../modules/tenant/application/use-cases/deactivate-branch.use-case';
import { ActivateBranchUseCase } from '../modules/tenant/application/use-cases/activate-branch.use-case';
import { GenerateLogoUploadUrlUseCase } from '../modules/tenant/application/use-cases/generate-logo-upload-url.use-case';
import { ConfirmLogoUploadUseCase } from '../modules/tenant/application/use-cases/confirm-logo-upload.use-case';
import { SupabaseBrandingStorageService } from '../modules/tenant/infrastructure/supabase-branding-storage.service';
import { StubBrandingStorageService } from '../modules/tenant/infrastructure/stub-branding-storage.service';
import type { TenantRouteContainer } from '../modules/tenant/interfaces/tenant.routes';

// User module
import { PrismaUserManagementRepository } from '../modules/user/infrastructure/prisma-user-management.repository';
import { CreateUserUseCase } from '../modules/user/application/use-cases/create-user.use-case';
import { GetUserUseCase } from '../modules/user/application/use-cases/get-user.use-case';
import { ListUsersUseCase } from '../modules/user/application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from '../modules/user/application/use-cases/update-user.use-case';
import { DeactivateUserUseCase } from '../modules/user/application/use-cases/deactivate-user.use-case';
import { UnlockUserUseCase } from '../modules/user/application/use-cases/unlock-user.use-case';
import { ResetUserPasswordUseCase } from '../modules/user/application/use-cases/reset-user-password.use-case';
import { InviteUserUseCase } from '../modules/user/application/use-cases/invite-user.use-case';
import type { UserRouteContainer } from '../modules/user/interfaces/user.routes';

// Property module
import { PrismaPropertyRepository } from '../modules/property/infrastructure/prisma-property.repository';
import { CreatePropertyUseCase } from '../modules/property/application/use-cases/create-property.use-case';
import { GetPropertyUseCase } from '../modules/property/application/use-cases/get-property.use-case';
import { ListPropertiesUseCase } from '../modules/property/application/use-cases/list-properties.use-case';
import { GetPropertySummaryUseCase } from '../modules/property/application/use-cases/get-property-summary.use-case';
import { UpdatePropertyUseCase } from '../modules/property/application/use-cases/update-property.use-case';
import { DeletePropertyUseCase } from '../modules/property/application/use-cases/delete-property.use-case';
import { GeocodePropertyUseCase } from '../modules/property/application/use-cases/geocode-property.use-case';
import { SearchAddressesUseCase } from '../modules/property/application/use-cases/search-addresses.use-case';
import { CachedAddressLookupService } from '../modules/property/infrastructure/cached-address-lookup.service';
import { GeocodeWorker } from '../modules/property/infrastructure/workers/geocode.worker';
import { GeocodeRetryWorker } from '../modules/property/infrastructure/workers/geocode-retry.worker';
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
import { DeactivateInspectorUseCase } from '../modules/inspector/application/use-cases/deactivate-inspector.use-case';
import { GenerateInspectorPhotoUploadUrlUseCase } from '../modules/inspector/application/use-cases/generate-inspector-photo-upload-url.use-case';
import { ConfirmInspectorPhotoUploadUseCase } from '../modules/inspector/application/use-cases/confirm-inspector-photo-upload.use-case';
import { UpdateInspectorSelfProfileUseCase } from '../modules/inspector/application/use-cases/update-inspector-self-profile.use-case';
import { GenerateInspectorDocumentUploadUrlUseCase } from '../modules/inspector/application/use-cases/generate-inspector-document-upload-url.use-case';
import { ConfirmInspectorDocumentUploadUseCase } from '../modules/inspector/application/use-cases/confirm-inspector-document-upload.use-case';
import { GetInspectorDocumentDownloadUrlUseCase } from '../modules/inspector/application/use-cases/get-inspector-document-download-url.use-case';
import { GetInspectorAvailabilityTemplateUseCase } from '../modules/inspector/application/use-cases/get-inspector-availability-template.use-case';
import { UpdateInspectorAvailabilityTemplateUseCase } from '../modules/inspector/application/use-cases/update-inspector-availability-template.use-case';
import { GetInspectorAvailabilityTemplateForOperatorUseCase } from '../modules/inspector/application/use-cases/get-inspector-availability-template-for-operator.use-case';
import { PrismaInspectorAppointmentChecker } from '../modules/inspector/infrastructure/prisma-inspector-appointment-checker';
import type { InspectorRouteContainer } from '../modules/inspector/interfaces/inspector.routes';

// Authorization service
import { AuthorizationService } from '../shared/domain/authorization.service';

// Audit module
import { PrismaAuditLogRepository } from '../modules/audit/infrastructure/prisma-audit-log.repository';
import { PersistentAuditService } from '../modules/audit/application/services/persistent-audit.service';
// Feature 020: retention + preservation + PII mapping repositories
import { PrismaAuditRetentionCategoryRepository } from '../modules/audit/infrastructure/prisma-audit-retention-category.repository';
import { PrismaAuditPreservationRuleRepository } from '../modules/audit/infrastructure/prisma-audit-preservation-rule.repository';
import { PrismaAuditLegalHoldRepository } from '../modules/audit/infrastructure/prisma-audit-legal-hold.repository';
import { PrismaPiiFieldMappingRepository } from '../modules/audit/infrastructure/prisma-pii-field-mapping.repository';
import { PrismaDataSubjectErasureRequestRepository } from '../modules/audit/infrastructure/prisma-data-subject-erasure-request.repository';
import { PrismaErasurePiiResolver } from '../modules/audit/infrastructure/prisma-erasure-pii-resolver';
import { ListAuditLogsUseCase } from '../modules/audit/application/use-cases/list-audit-logs.use-case';
import type { AuditRouteContainer } from '../modules/audit/interfaces/audit.routes';
import type { AuditErasureRouteContainer } from '../modules/audit/interfaces/audit-erasure.routes';
import type { AuditRetentionRouteContainer } from '../modules/audit/interfaces/audit-retention.routes';
import { PreviewDataSubjectErasureUseCase } from '../modules/audit/application/use-cases/preview-data-subject-erasure.use-case';
import { ExecuteDataSubjectErasureUseCase } from '../modules/audit/application/use-cases/execute-data-subject-erasure.use-case';
import { GetDataSubjectErasureRequestUseCase } from '../modules/audit/application/use-cases/get-data-subject-erasure-request.use-case';
import { ListDataSubjectErasureRequestsUseCase } from '../modules/audit/application/use-cases/list-data-subject-erasure-requests.use-case';
import { UpsertRetentionCategoryUseCase } from '../modules/audit/application/use-cases/upsert-retention-category.use-case';
import { UpsertPreservationRuleUseCase } from '../modules/audit/application/use-cases/upsert-preservation-rule.use-case';
import { PlaceLegalHoldUseCase } from '../modules/audit/application/use-cases/place-legal-hold.use-case';
import { ReleaseLegalHoldUseCase } from '../modules/audit/application/use-cases/release-legal-hold.use-case';
import { UpsertPiiFieldMappingUseCase } from '../modules/audit/application/use-cases/upsert-pii-field-mapping.use-case';
import { TriggerRetentionRunUseCase } from '../modules/audit/application/use-cases/trigger-retention-run.use-case';
import { ListRetentionRunsUseCase } from '../modules/audit/application/use-cases/list-retention-runs.use-case';

// Service group module
import { PrismaServiceGroupRepository } from '../modules/service-group/infrastructure/prisma-service-group.repository';
import { CreateServiceGroupUseCase } from '../modules/service-group/application/use-cases/create-service-group.use-case';
import { GetServiceGroupUseCase } from '../modules/service-group/application/use-cases/get-service-group.use-case';
import { ListServiceGroupsUseCase } from '../modules/service-group/application/use-cases/list-service-groups.use-case';
import { PublishServiceGroupUseCase } from '../modules/service-group/application/use-cases/publish-service-group.use-case';
import { AssignInspectorManuallyUseCase } from '../modules/service-group/application/use-cases/assign-inspector-manually.use-case';
import { AcceptOfferUseCase } from '../modules/service-group/application/use-cases/accept-offer.use-case';
import { GetMarketplaceOffersUseCase } from '../modules/service-group/application/use-cases/get-marketplace-offers.use-case';
import { GetMarketplaceOfferDetailUseCase } from '../modules/service-group/application/use-cases/get-marketplace-offer-detail.use-case';
import { CancelServiceGroupUseCase } from '../modules/service-group/application/use-cases/cancel-service-group.use-case';
import { RejectServiceGroupUseCase } from '../modules/service-group/application/use-cases/reject-service-group.use-case';
import { UpdateServiceGroupUseCase } from '../modules/service-group/application/use-cases/update-service-group.use-case';
import { RepublishServiceGroupUseCase } from '../modules/service-group/application/use-cases/republish-service-group.use-case';
import type { ServiceGroupRouteContainer } from '../modules/service-group/interfaces/service-group.routes';
import type { MarketplaceRouteContainer } from '../modules/service-group/interfaces/marketplace.routes';

// Tenant portal module
import { PrismaRentalTenantPortalTokenRepository } from '../modules/rental-tenant-portal/infrastructure/prisma-rental-tenant-portal-token.repository';
import { PrismaRentalTenantPortalActivityRepository } from '../modules/rental-tenant-portal/infrastructure/prisma-rental-tenant-portal-activity.repository';
import { TokenService } from '../modules/rental-tenant-portal/domain/token.service';
import { MintPortalTokenService } from '../modules/rental-tenant-portal/domain/mint-portal-token.service';
import { GetPortalDataUseCase } from '../modules/rental-tenant-portal/application/use-cases/get-portal-data.use-case';
import { ConfirmAppointmentUseCase } from '../modules/rental-tenant-portal/application/use-cases/confirm-appointment.use-case';
import { RescheduleRequestUseCase } from '../modules/rental-tenant-portal/application/use-cases/reschedule-request.use-case';
import { UpdateContactUseCase } from '../modules/rental-tenant-portal/application/use-cases/update-contact.use-case';
import { ReportUnavailabilityUseCase } from '../modules/rental-tenant-portal/application/use-cases/report-unavailability.use-case';
import { GeneratePortalTokenUseCase } from '../modules/rental-tenant-portal/application/use-cases/generate-portal-token.use-case';
import { ListPortalActivitiesUseCase } from '../modules/rental-tenant-portal/application/use-cases/list-portal-activities.use-case';
import { GetAvailableGroupsUseCase } from '../modules/rental-tenant-portal/application/use-cases/get-available-groups.use-case';
import { JoinGroupUseCase } from '../modules/rental-tenant-portal/application/use-cases/join-group.use-case';
import type { RentalTenantPortalRouteContainer } from '../modules/rental-tenant-portal/interfaces/rental-tenant-portal.routes';

// Inspector execution module
import { PrismaInspectionExecutionRepository } from '../modules/inspector-execution/infrastructure/prisma-inspection-execution.repository';
import { PrismaIdempotencyService } from '../modules/inspector-execution/infrastructure/prisma-idempotency.service';
import { StubStorageService } from '../modules/inspector-execution/infrastructure/stub-storage.service';
import { SupabaseStorageService } from '../modules/inspector-execution/infrastructure/supabase-storage.service';
import { PrismaServiceTypeReader } from '../modules/inspector-execution/infrastructure/prisma-service-type-reader';
import { PrismaContactReader } from '../modules/inspector-execution/infrastructure/prisma-contact-reader';
import { PrismaTenantSettingsReader } from '../modules/inspector-execution/infrastructure/prisma-tenant-settings-reader';
import { GetInspectorScheduleUseCase } from '../modules/inspector-execution/application/use-cases/get-inspector-schedule.use-case';
import { GetAppointmentDetailUseCase } from '../modules/inspector-execution/application/use-cases/get-appointment-detail.use-case';
import { StartInspectionUseCase } from '../modules/inspector-execution/application/use-cases/start-inspection.use-case';
import { FinishInspectionUseCase } from '../modules/inspector-execution/application/use-cases/finish-inspection.use-case';
import { SaveExecutionProgressUseCase } from '../modules/inspector-execution/application/use-cases/save-execution-progress.use-case';
import { ReopenExecutionUseCase } from '../modules/inspector-execution/application/use-cases/reopen-execution.use-case';
import type { InspectorExecutionRouteContainer } from '../modules/inspector-execution/interfaces/inspector-execution.routes';

// Billing module
import { PrismaFinancialEntryRepository } from '../modules/billing/infrastructure/prisma-financial-entry.repository';
import { PrismaInspectorInvoiceRepository } from '../modules/billing/infrastructure/prisma-inspector-invoice.repository';
import { CreateFinancialEntriesOnDoneUseCase } from '../modules/billing/application/use-cases/create-financial-entries-on-done.use-case';
import { ListFinancialEntriesUseCase } from '../modules/billing/application/use-cases/list-financial-entries.use-case';
import { GetFinancialEntryUseCase } from '../modules/billing/application/use-cases/get-financial-entry.use-case';
import { GetFinancialSummaryUseCase } from '../modules/billing/application/use-cases/get-financial-summary.use-case';
import { ApproveFinancialEntryUseCase } from '../modules/billing/application/use-cases/approve-financial-entry.use-case';
import { CancelFinancialEntryUseCase } from '../modules/billing/application/use-cases/cancel-financial-entry.use-case';
import { CreateManualAdjustmentUseCase } from '../modules/billing/application/use-cases/create-manual-adjustment.use-case';
import { CreateRefundUseCase } from '../modules/billing/application/use-cases/create-refund.use-case';
import { ListInvoicesUseCase } from '../modules/billing/application/use-cases/list-invoices.use-case';
import { GetInvoiceUseCase } from '../modules/billing/application/use-cases/get-invoice.use-case';
import { DownloadInvoiceUseCase } from '../modules/billing/application/use-cases/download-invoice.use-case';
import { MarkInvoicePaidUseCase } from '../modules/billing/application/use-cases/mark-invoice-paid.use-case';
import { BatchMarkInvoicesPaidUseCase } from '../modules/billing/application/use-cases/batch-mark-invoices-paid.use-case';
import { ReverseInvoicePaymentUseCase } from '../modules/billing/application/use-cases/reverse-invoice-payment.use-case';
import { GetReconciliationSummaryUseCase } from '../modules/billing/application/use-cases/get-reconciliation-summary.use-case';
import { GetInvoiceSummaryUseCase } from '../modules/billing/application/use-cases/get-invoice-summary.use-case';
import { VoidFinancialEntryUseCase } from '../modules/billing/application/use-cases/void-financial-entry.use-case';
import { ApproveDraftInvoiceUseCase } from '../modules/billing/application/use-cases/approve-draft-invoice.use-case';
import { RejectDraftInvoiceUseCase } from '../modules/billing/application/use-cases/reject-draft-invoice.use-case';
import { ExportAgencyFinancialUseCase } from '../modules/billing/application/use-cases/export-agency-financial.use-case';
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
import { PrismaNotificationAttemptRepository } from '../modules/notification/infrastructure/prisma-notification-attempt.repository';
import { PrismaNotificationConsentRepository } from '../modules/notification/infrastructure/prisma-notification-consent.repository';
import { TemplateRendererService } from '../modules/notification/domain/template-renderer.service';
import { SendNotificationUseCase } from '../modules/notification/application/use-cases/send-notification.use-case';
import { RetryNotificationUseCase } from '../modules/notification/application/use-cases/retry-notification.use-case';
import { HandleProviderWebhookUseCase } from '../modules/notification/application/use-cases/handle-provider-webhook.use-case';
import { ListNotificationsUseCase } from '../modules/notification/application/use-cases/list-notifications.use-case';
import { GetNotificationUseCase } from '../modules/notification/application/use-cases/get-notification.use-case';
import { UpsertNotificationTemplateUseCase } from '../modules/notification/application/use-cases/upsert-notification-template.use-case';
import { DeleteNotificationTemplateUseCase } from '../modules/notification/application/use-cases/delete-notification-template.use-case';
import { SendTestNotificationUseCase } from '../modules/notification/application/use-cases/send-test-notification.use-case';
import { ListNotificationTemplatesUseCase } from '../modules/notification/application/use-cases/list-notification-templates.use-case';
import { CreateNotificationUseCase } from '../modules/notification/application/use-cases/create-notification.use-case';
import { PollRetryableNotificationsUseCase } from '../modules/notification/application/use-cases/poll-retryable-notifications.use-case';
import { PollSmsDeliveryUseCase } from '../modules/notification/application/use-cases/poll-sms-delivery.use-case';
import { DispatchRemindersUseCase } from '../modules/notification/application/use-cases/dispatch-reminders.use-case';
import { DispatchEscalationsUseCase } from '../modules/notification/application/use-cases/dispatch-escalations.use-case';
import { ListConsentsByRecipientUseCase } from '../modules/notification/application/use-cases/list-consents-by-recipient.use-case';
import { OverrideConsentUseCase } from '../modules/notification/application/use-cases/override-consent.use-case';
import { BuildNotificationPayloadService } from '../modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../modules/appointment/domain/appointment-code.formatter';
import type { NotificationRouteContainer } from '../modules/notification/interfaces/notification.routes';
import { createWebhookSignatureValidator } from '../modules/notification/infrastructure/webhook-signature-validator';
import { SanitizeHtmlService } from '../modules/notification/infrastructure/sanitize-html.service';
import { HtmlToTextService } from '../modules/notification/infrastructure/html-to-text.service';
import { RenderTemplatePreviewUseCase } from '../modules/notification/application/use-cases/render-template-preview.use-case';
import { PrismaEmailAssetRepository } from '../modules/notification/infrastructure/prisma-email-asset.repository';
import { PrismaTemplateImageBindingRepository } from '../modules/notification/infrastructure/prisma-template-image-binding.repository';
import { SupabaseEmailAssetStorageService } from '../modules/notification/infrastructure/supabase-email-asset-storage.service';
import { ImageContentVerifier } from '../modules/notification/infrastructure/image-content-verifier';
import { RequestImageUploadUseCase } from '../modules/notification/application/use-cases/request-image-upload.use-case';
import { ConfirmImageUploadUseCase } from '../modules/notification/application/use-cases/confirm-image-upload.use-case';
import { ListEmailAssetsUseCase } from '../modules/notification/application/use-cases/list-email-assets.use-case';
import { EditImageBindingUseCase } from '../modules/notification/application/use-cases/edit-image-binding.use-case';
import { DeleteEmailAssetUseCase } from '../modules/notification/application/use-cases/delete-email-asset.use-case';
import { ImagePlaceholderResolver } from '../modules/notification/domain/image-placeholder-resolver.service';

// Notification handlers
import { NotifyOnStatusTransitionHandler } from '../modules/notification/application/handlers/notify-on-status-transition.handler';
import { NotifyOnAdminRescheduleHandler } from '../modules/notification/application/handlers/notify-on-admin-reschedule.handler';
import { NotifyOnRentalTenantPortalActionHandler } from '../modules/notification/application/handlers/notify-on-rental-tenant-portal-action.handler';

// Workers
import { CleanupSessionsWorker } from '../modules/auth/infrastructure/workers/cleanup-sessions.worker';
import { KeyExpiryCheckWorker } from '../modules/auth/infrastructure/workers/key-expiry-check.worker';
import { ExpireFilesWorker } from '../modules/report/infrastructure/workers/expire-files.worker';
import { GenerateInvoiceFileWorker } from '../modules/billing/infrastructure/workers/generate-invoice-file.worker';
import { PdfKitInvoicePdfGenerator } from '../modules/billing/infrastructure/pdfkit-invoice-pdf.generator';
import { ExpireTokensWorker } from '../modules/rental-tenant-portal/infrastructure/workers/expire-tokens.worker';
import { NotifyStuckInspectionsWorker } from '../modules/inspector-execution/infrastructure/workers/notify-stuck.worker';
import { AuditRetentionWorker } from '../modules/audit/infrastructure/workers/audit-retention.worker';

// Dashboard module
import { PrismaDashboardRepository } from '../modules/dashboard/infrastructure/prisma-dashboard.repository';
import { GetDashboardStatsUseCase } from '../modules/dashboard/application/use-cases/get-dashboard-stats.use-case';
import type { DashboardRouteContainer } from '../modules/dashboard/interfaces/dashboard.routes';

// Service region module
import { PrismaServiceRegionRepository } from '../modules/service-region/infrastructure/prisma-service-region.repository';
import { CreateServiceRegionUseCase } from '../modules/service-region/application/use-cases/create-service-region.use-case';
import { UpdateServiceRegionUseCase } from '../modules/service-region/application/use-cases/update-service-region.use-case';
import { GetServiceRegionUseCase } from '../modules/service-region/application/use-cases/get-service-region.use-case';
import { ListServiceRegionsUseCase } from '../modules/service-region/application/use-cases/list-service-regions.use-case';
import { DeactivateServiceRegionUseCase } from '../modules/service-region/application/use-cases/deactivate-service-region.use-case';
import { DeleteServiceRegionUseCase } from '../modules/service-region/application/use-cases/delete-service-region.use-case';
import { ResolveRegionsUseCase } from '../modules/service-region/application/use-cases/resolve-regions.use-case';
import { NotifyInspectorsOnRegionDeactivationHandler } from '../modules/service-region/application/handlers/notify-inspectors-on-region-deactivation.handler';
import { SERVICE_REGION_EVENTS } from '../shared/application/events/domain-event-bus';
import type { ServiceRegionRouteContainer } from '../modules/service-region/interfaces/service-region.routes';

// Contact module
import { PrismaContactRepository } from '../modules/contact/infrastructure/prisma-contact.repository';
import { CreateContactUseCase } from '../modules/contact/application/use-cases/create-contact.use-case';
import { UpdateContactUseCase as UpdateContactRegistryUseCase } from '../modules/contact/application/use-cases/update-contact.use-case';
import { GetContactUseCase } from '../modules/contact/application/use-cases/get-contact.use-case';
import { ListContactsUseCase } from '../modules/contact/application/use-cases/list-contacts.use-case';
import type { ContactRouteContainer } from '../modules/contact/interfaces/http/contact.routes';

// App-credential module
import { PrismaAppCredentialRepository } from '../modules/app-credential/infrastructure/prisma-app-credential.repository';
import { CreateAppCredentialUseCase } from '../modules/app-credential/application/use-cases/create-app-credential.use-case';
import { UpdateAppCredentialUseCase } from '../modules/app-credential/application/use-cases/update-app-credential.use-case';
import { GetAppCredentialUseCase } from '../modules/app-credential/application/use-cases/get-app-credential.use-case';
import { ListAppCredentialsUseCase } from '../modules/app-credential/application/use-cases/list-app-credentials.use-case';
import type { AppCredentialRouteContainer } from '../modules/app-credential/interfaces/http/app-credential.routes';
import type { IntegrationRouteContainer } from '../modules/integration/interfaces/http/integration.routes';
import { ListIntegrationsUseCase } from '../modules/integration/application/use-cases/list-integrations.use-case';
import { UpsertIntegrationSettingUseCase } from '../modules/integration/application/use-cases/upsert-integration-setting.use-case';
import { DeleteIntegrationSettingUseCase } from '../modules/integration/application/use-cases/delete-integration-setting.use-case';
import { TestIntegrationConnectionUseCase } from '../modules/integration/application/use-cases/test-integration-connection.use-case';
import { HttpIntegrationConnectionTester } from '../modules/integration/infrastructure/integration-connection-tester';
import { PrismaApiKeyRepository } from '../modules/integration/infrastructure/prisma-api-key.repository';
import { CreateApiKeyUseCase } from '../modules/integration/application/use-cases/create-api-key.use-case';
import { ListApiKeysUseCase } from '../modules/integration/application/use-cases/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../modules/integration/application/use-cases/revoke-api-key.use-case';

// Fy agent module (external WhatsApp bot API)
import type { FyRouteContainer } from '../modules/fy/interfaces/fy.routes';
import { PrismaFyRepository } from '../modules/fy/infrastructure/prisma-fy.repository';
import { FindFyAppointmentsByPhoneUseCase } from '../modules/fy/application/use-cases/find-fy-appointments-by-phone.use-case';
import { GetFyAppointmentUseCase } from '../modules/fy/application/use-cases/get-fy-appointment.use-case';
import { GetFyAgencyUseCase } from '../modules/fy/application/use-cases/get-fy-agency.use-case';
import { GetFyAvailableDatesUseCase } from '../modules/fy/application/use-cases/get-fy-available-dates.use-case';
import { AddFyAppointmentNoteUseCase } from '../modules/fy/application/use-cases/add-fy-appointment-note.use-case';
import { UpdateFyAppointmentContactUseCase } from '../modules/fy/application/use-cases/update-fy-appointment-contact.use-case';
import { ResendFyNoticeUseCase } from '../modules/fy/application/use-cases/resend-fy-notice.use-case';
import { FyWebhookDispatcher } from '../modules/fy/infrastructure/fy-webhook-dispatcher';
import { FyWebhookSubscriber } from '../modules/fy/application/webhooks/fy-webhook-subscriber';
import { createApiKeyAuthMiddleware } from '../shared/interfaces/api-key-auth-middleware';
import { createAuthMiddleware } from '../shared/interfaces/auth-middleware';

// Appointment module
import { PrismaAppointmentRepository } from '../modules/appointment/infrastructure/prisma-appointment.repository';
import { CreateAppointmentUseCase } from '../modules/appointment/application/use-cases/create-appointment.use-case';
import { GetAppointmentUseCase } from '../modules/appointment/application/use-cases/get-appointment.use-case';
import { ListAppointmentsUseCase } from '../modules/appointment/application/use-cases/list-appointments.use-case';
import { UpdateAppointmentUseCase } from '../modules/appointment/application/use-cases/update-appointment.use-case';
import { ExecuteStatusTransitionUseCase } from '../modules/appointment/application/use-cases/execute-status-transition.use-case';
import { PerformCrossCheckUseCase } from '../modules/appointment/application/use-cases/perform-cross-check.use-case';
import { ForceManualTenantConfirmationUseCase } from '../modules/appointment/application/use-cases/force-manual-confirmation.use-case';
import { PreviewAppointmentImportUseCase } from '../modules/appointment/application/use-cases/preview-appointment-import.use-case';
import { CommitAppointmentImportUseCase } from '../modules/appointment/application/use-cases/commit-appointment-import.use-case';
import { ExportAppointmentImportErrorsUseCase } from '../modules/appointment/application/use-cases/export-appointment-import-errors.use-case';
import { GetImportStatusUseCase } from '../modules/appointment/application/use-cases/get-import-status.use-case';
import { CompensateFinancialOnDoneRejectedHandler } from '../modules/appointment/application/handlers/compensate-financial-on-done-rejected.handler';
import { APPOINTMENT_EVENTS } from '../shared/application/events/domain-event-bus';
import { DeleteAppointmentUseCase } from '../modules/appointment/application/use-cases/delete-appointment.use-case';
import { BulkEditAppointmentsUseCase } from '../modules/appointment/application/use-cases/bulk-edit-appointments.use-case';
import { BulkResendReminderUseCase } from '../modules/appointment/application/use-cases/bulk-resend-reminder.use-case';
import { BulkCancelAppointmentsUseCase } from '../modules/appointment/application/use-cases/bulk-cancel-appointments.use-case';
import { BulkRescheduleAppointmentsUseCase } from '../modules/appointment/application/use-cases/bulk-reschedule-appointments.use-case';
import { BulkStatusTransitionUseCase } from '../modules/appointment/application/use-cases/bulk-status-transition.use-case';
import { BulkAssignInspectorUseCase } from '../modules/appointment/application/use-cases/bulk-assign-inspector.use-case';
import { BulkReopenForRescheduleUseCase } from '../modules/appointment/application/use-cases/bulk-reopen-for-reschedule.use-case';
import { AddAppointmentsToGroupUseCase } from '../modules/service-group/application/use-cases/add-appointments-to-group.use-case';
import { CheckAppointmentsEligibilityForGroupUseCase } from '../modules/service-group/application/use-cases/check-appointments-eligibility-for-group.use-case';
import { FindAddableGroupsForAppointmentsUseCase } from '../modules/service-group/application/use-cases/find-addable-groups-for-appointments.use-case';
import { GetGroupPortalLinkPlanUseCase } from '../modules/service-group/application/use-cases/get-group-portal-link-plan.use-case';
import { SendGroupPortalLinksUseCase } from '../modules/service-group/application/use-cases/send-group-portal-links.use-case';
import { GetAvailablePeriodsUseCase } from '../modules/billing/application/use-cases/get-available-periods.use-case';
import { GetInspectorEarningsSummaryUseCase } from '../modules/billing/application/use-cases/get-inspector-earnings-summary.use-case';
import { PreviewInvoiceUseCase } from '../modules/billing/application/use-cases/preview-invoice.use-case';
import { RequestInvoiceUseCase } from '../modules/billing/application/use-cases/request-invoice.use-case';
import { ReopenForRescheduleUseCase } from '../modules/appointment/application/use-cases/reopen-for-reschedule.use-case';
import { PrismaAppointmentImportRepository } from '../modules/appointment/infrastructure/prisma-appointment-import.repository';
import { AppointmentImportRowResolver } from '../modules/appointment/application/services/appointment-import-row-resolver';
import { AppointmentImportCommitWorker } from '../modules/appointment/infrastructure/workers/appointment-import-commit.worker';
import { SweepAbandonedAppointmentImportsWorker } from '../modules/appointment/infrastructure/workers/sweep-abandoned-appointment-imports.worker';
import { ImportGeocodeVerifier } from '../modules/property/application/services/import-geocode-verifier';
import { RejectUnconfirmedAppointmentsUseCase } from '../modules/appointment/application/use-cases/reject-unconfirmed-appointments.use-case';
import { RejectUnconfirmedWorker } from '../modules/appointment/infrastructure/workers/reject-unconfirmed.worker';
import { GetPortalLinkUseCase } from '../modules/rental-tenant-portal/application/use-cases/get-portal-link.use-case';
import { PrismaConfirmationCycleRepository } from '../modules/appointment/infrastructure/prisma-confirmation-cycle.repository';
import { ConfirmationCycleService } from '../modules/appointment/application/services/confirmation-cycle.service';
import { Aes256GcmService } from '../shared/infrastructure/crypto/aes-256-gcm.service';
import { PrismaIntegrationSettingRepository } from '../modules/integration/infrastructure/prisma-integration-setting.repository';
import { IntegrationConfigResolver } from '../modules/integration/infrastructure/integration-config-resolver';
import {
  DynamicAddressLookupService,
  DynamicEmailProvider,
  DynamicGeocodingService,
  DynamicSmsProvider,
} from '../modules/integration/infrastructure/dynamic-providers';
import { AesTokenEncrypterAdapter } from '../modules/rental-tenant-portal/infrastructure/aes-token-encrypter.adapter';
import type { AppointmentRouteContainer } from '../modules/appointment/interfaces/appointment.routes';

// Appointment time slot module

export interface AppContainer {
  prisma: typeof prisma;
  auditService: PersistentAuditService;
  domainEventBus: DomainEventBus;
  auth: AuthRouteContainer;
  tenant: TenantRouteContainer;
  user: UserRouteContainer;
  property: PropertyRouteContainer;
  serviceType: ServiceTypeRouteContainer;
  pricingRule: PricingRuleRouteContainer;
  inspector: InspectorRouteContainer;
  appointment: AppointmentRouteContainer;
  audit: AuditRouteContainer;
  auditErasure: AuditErasureRouteContainer;
  auditRetention: AuditRetentionRouteContainer;
  serviceGroup: ServiceGroupRouteContainer;
  marketplace: MarketplaceRouteContainer;
  rentalTenantPortal: RentalTenantPortalRouteContainer;
  inspectorExecution: InspectorExecutionRouteContainer;
  billing: BillingRouteContainer;
  report: ReportRouteContainer;
  notification: NotificationRouteContainer;
  dashboard: DashboardRouteContainer;
  serviceRegion: ServiceRegionRouteContainer;
  contact: ContactRouteContainer;
  appCredential: AppCredentialRouteContainer;
  integration: IntegrationRouteContainer;
  fy: FyRouteContainer;
  fyWebhookDispatcher: FyWebhookDispatcher;
  geocodeWorker: GeocodeWorker;
  geocodeRetryWorker: GeocodeRetryWorker;
  cleanupSessionsWorker: CleanupSessionsWorker;
  keyExpiryCheckWorker: KeyExpiryCheckWorker;
  expireFilesWorker: ExpireFilesWorker;
  processReportJobUseCase: ProcessReportJobUseCase;
  appointmentImportCommitWorker: AppointmentImportCommitWorker;
  sweepAbandonedAppointmentImportsWorker: SweepAbandonedAppointmentImportsWorker;
  generateInvoiceFileWorker: GenerateInvoiceFileWorker;
  expireTokensWorker: ExpireTokensWorker;
  notifyStuckInspectionsWorker: NotifyStuckInspectionsWorker;
  auditRetentionWorker: AuditRetentionWorker;
  rejectUnconfirmedWorker: RejectUnconfirmedWorker;
}

export function createContainer(logger: Logger): AppContainer {
  const env = getEnv();
  const auditLogRepo = new PrismaAuditLogRepository(prisma);
  const auditService = new PersistentAuditService(auditLogRepo, logger);
  // Feature 020: retention + preservation + PII registry repositories
  const auditRetentionCategoryRepo = new PrismaAuditRetentionCategoryRepository(prisma);
  const auditPreservationRuleRepo = new PrismaAuditPreservationRuleRepository(prisma);
  const auditLegalHoldRepo = new PrismaAuditLegalHoldRepository(prisma);
  const piiFieldMappingRepo = new PrismaPiiFieldMappingRepository(prisma);
  const dataSubjectErasureRequestRepo = new PrismaDataSubjectErasureRequestRepository(prisma);
  const authorizationService = new AuthorizationService(auditService);

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
    accessTokenTtlMinutes: env.JWT_ACCESS_TOKEN_TTL_MINUTES,
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

  // Trust signals
  const geoIpService = new StubGeoIpService();
  const sessionTrustService = new SessionTrustService(sessionRepo, geoIpService);

  // S3 storage service (shared across modules)
  const storageService = s3Client
    ? new SupabaseStorageService(s3Client)
    : new StubStorageService();

  // Auth use cases
  const loginUseCase = new LoginUseCase(userRepo, sessionRepo, jwtService, totpService, auditService, inspectorRepo, totpEncryptionService, sessionTrustService);
  const refreshTokenUseCase = new RefreshTokenUseCase(userRepo, sessionRepo, jwtService, auditService, inspectorRepo);
  const logoutUseCase = new LogoutUseCase(sessionRepo, auditService);
  const getMeUseCase = new GetMeUseCase(userRepo, inspectorRepo, storageService, tenantRepo);
  const passwordHistoryRepo = new PrismaPasswordHistoryRepository(prisma);
  const changePasswordUseCase = new ChangePasswordUseCase(userRepo, sessionRepo, auditService, passwordHistoryRepo);
  const revokeSessionUseCase = new RevokeSessionUseCase(sessionRepo, auditService);
  const listSessionsUseCase = new ListSessionsUseCase(sessionRepo);
  const setupTotpUseCase = new SetupTotpUseCase(userRepo, totpService, auditService, totpEncryptionService);
  const confirmTotpUseCase = new ConfirmTotpUseCase(userRepo, totpService, auditService, totpEncryptionService);
  const passwordResetTokenRepo = new PrismaPasswordResetTokenRepository(prisma);

  // Domain event bus (single instance shared across modules)
  const domainEventBus = new DomainEventBus();

  // Tenant use cases
  const getTenantUseCase = new GetTenantUseCase(tenantRepo);
  const listTenantsUseCase = new ListTenantsUseCase(tenantRepo, branchRepo, authorizationService);
  const updateTenantUseCase = new UpdateTenantUseCase(tenantRepo, auditService, domainEventBus);
  const activateTenantUseCase = new ActivateTenantUseCase(tenantRepo, auditService, authorizationService, domainEventBus);
  const deactivateTenantUseCase = new DeactivateTenantUseCase(tenantRepo, appointmentChecker, auditService, authorizationService, domainEventBus);
  const createBranchUseCase = new CreateBranchUseCase(tenantRepo, branchRepo, auditService, domainEventBus);
  const getBranchUseCase = new GetBranchUseCase(tenantRepo, branchRepo);
  const listBranchesUseCase = new ListBranchesUseCase(tenantRepo, branchRepo);
  const updateBranchUseCase = new UpdateBranchUseCase(tenantRepo, branchRepo, auditService, domainEventBus);
  const deactivateBranchUseCase = new DeactivateBranchUseCase(tenantRepo, branchRepo, appointmentChecker, auditService, authorizationService, domainEventBus);
  const activateBranchUseCase = new ActivateBranchUseCase(tenantRepo, branchRepo, auditService, authorizationService, domainEventBus);

  // Branding storage service
  const brandingStorageService = s3Client && env.SUPABASE_STORAGE_PUBLIC_URL
    ? new SupabaseBrandingStorageService(s3Client, env.SUPABASE_STORAGE_PUBLIC_URL)
    : new StubBrandingStorageService();

  const generateLogoUploadUrlUseCase = new GenerateLogoUploadUrlUseCase(tenantRepo, brandingStorageService);
  const confirmLogoUploadUseCase = new ConfirmLogoUploadUseCase(tenantRepo, brandingStorageService, auditService);

  // User use cases
  const createUserUseCase = new CreateUserUseCase(userManagementRepo, tenantRepo, branchRepo, auditService, authorizationService);
  const getUserUseCase = new GetUserUseCase(userManagementRepo);
  const listUsersUseCase = new ListUsersUseCase(userManagementRepo);
  const updateUserUseCase = new UpdateUserUseCase(userManagementRepo, tenantRepo, branchRepo, auditService, authorizationService);
  const deactivateUserUseCase = new DeactivateUserUseCase(userManagementRepo, tenantRepo, auditService, authorizationService);
  const unlockUserUseCase = new UnlockUserUseCase(userManagementRepo, auditService, authorizationService);
  const resetUserPasswordUseCase = new ResetUserPasswordUseCase(userManagementRepo, auditService, passwordHistoryRepo, authorizationService);

  // Outbound integration credentials (Resend / MobileMessage / Mapbox) managed
  // by AM via the Integrations Hub. Database config overrides env vars; when
  // neither is present the dynamic providers degrade to the existing stubs.
  // Encrypted at rest with the same key-per-purpose scheme as app credentials.
  const integrationEncKey =
    env.APP_CREDENTIAL_ENC_KEY ?? '0000000000000000000000000000000000000000000000000000000000000000';
  const integrationSettingRepo = new PrismaIntegrationSettingRepository(
    prisma,
    new Aes256GcmService(integrationEncKey),
  );
  const apiKeyRepo = new PrismaApiKeyRepository(prisma);
  const compactConfig = (obj: Record<string, string | undefined>): Record<string, string> =>
    Object.fromEntries(Object.entries(obj).filter(([, value]) => !!value)) as Record<string, string>;
  const integrationConfigResolver = new IntegrationConfigResolver(
    integrationSettingRepo,
    {
      resend: compactConfig({ apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL }),
      mobile_message: compactConfig({
        apiKey: env.MOBILE_MESSAGE_API_KEY,
        password: env.MOBILE_MESSAGE_PASSWORD,
        senderId: env.MOBILE_MESSAGE_SENDER_ID,
        webhookToken: env.MOBILE_MESSAGE_WEBHOOK_TOKEN,
      }),
      mapbox: compactConfig({ accessToken: env.MAPBOX_ACCESS_TOKEN }),
      fy_webhook: compactConfig({ url: env.FY_WEBHOOK_URL, secret: env.FY_WEBHOOK_SECRET }),
    },
    logger,
  );

  // Property repositories and use cases
  const propertyRepo = new PrismaPropertyRepository(prisma);
  const geocodingService = new DynamicGeocodingService(integrationConfigResolver);
  // Geocode synchronously at creation time so a new property has coordinates the
  // instant the request returns (the async worker remains the fallback).
  const createPropertyUseCase = new CreatePropertyUseCase(propertyRepo, branchRepo, auditService, tenantRepo, authorizationService, logger, geocodingService);
  const getPropertyUseCase = new GetPropertyUseCase(propertyRepo);
  const listPropertiesUseCase = new ListPropertiesUseCase(propertyRepo);
  const getPropertySummaryUseCase = new GetPropertySummaryUseCase(propertyRepo);
  const updatePropertyUseCase = new UpdatePropertyUseCase(propertyRepo, branchRepo, auditService);
  const deletePropertyUseCase = new DeletePropertyUseCase(propertyRepo, appointmentChecker, auditService);
  const geocodePropertyUseCase = new GeocodePropertyUseCase(propertyRepo, authorizationService);
  const rawAddressLookupService = new DynamicAddressLookupService(integrationConfigResolver);
  const addressLookupService = new CachedAddressLookupService(rawAddressLookupService);
  const searchAddressesUseCase = new SearchAddressesUseCase(addressLookupService);
  const geocodeWorker = new GeocodeWorker(propertyRepo, geocodingService, auditService, logger);
  const geocodeRetryWorker = new GeocodeRetryWorker(propertyRepo, logger);

  // Property import

  // Service type repositories and use cases
  const serviceTypeRepo = new PrismaServiceTypeRepository(prisma);
  const createServiceTypeUseCase = new CreateServiceTypeUseCase(serviceTypeRepo, auditService);
  const getServiceTypeUseCase = new GetServiceTypeUseCase(serviceTypeRepo);
  const listServiceTypesUseCase = new ListServiceTypesUseCase(serviceTypeRepo);
  const updateServiceTypeUseCase = new UpdateServiceTypeUseCase(serviceTypeRepo, auditService);

  // Pricing rule repositories and use cases
  const pricingRuleRepo = new PrismaPricingRuleRepository(prisma);
  const createPricingRuleUseCase = new CreatePricingRuleUseCase(pricingRuleRepo, serviceTypeRepo, branchRepo, tenantRepo, auditService);
  const listPricingRulesUseCase = new ListPricingRulesUseCase(pricingRuleRepo, tenantRepo);
  const updatePricingRuleUseCase = new UpdatePricingRuleUseCase(pricingRuleRepo, tenantRepo, auditService);

  // Contact repository + use cases
  const contactRepo = new PrismaContactRepository(prisma);
  const createContactUseCase = new CreateContactUseCase(contactRepo, auditService);
  const updateContactRegistryUseCase = new UpdateContactRegistryUseCase(contactRepo, auditService);
  const getContactUseCase = new GetContactUseCase(contactRepo);
  const listContactsUseCase = new ListContactsUseCase(contactRepo);

  // App-credential repository + use cases. Passwords are encrypted at rest via
  // AES-256-GCM (key-per-purpose). A fixed dev/test key is used when the env
  // var is absent — APP_CREDENTIAL_ENC_KEY is required in staging/production
  // (enforced in env.ts), so production never falls back to the dev key.
  const appCredentialEncKey =
    env.APP_CREDENTIAL_ENC_KEY ?? '0000000000000000000000000000000000000000000000000000000000000000';
  const appCredentialRepo = new PrismaAppCredentialRepository(
    prisma,
    new Aes256GcmService(appCredentialEncKey),
  );
  const createAppCredentialUseCase = new CreateAppCredentialUseCase(appCredentialRepo, auditService, branchRepo);
  const updateAppCredentialUseCase = new UpdateAppCredentialUseCase(appCredentialRepo, auditService, branchRepo);
  const getAppCredentialUseCase = new GetAppCredentialUseCase(appCredentialRepo);
  const listAppCredentialsUseCase = new ListAppCredentialsUseCase(appCredentialRepo);

  // Service region repository (instantiated early for inspector and marketplace use)
  const serviceRegionRepo = new PrismaServiceRegionRepository(prisma);

  // Inspector use cases
  const availabilitySlotRepo = new PrismaAvailabilitySlotRepository(prisma);
  const createInspectorUseCase = new CreateInspectorUseCase(inspectorRepo, userManagementRepo, auditService, serviceRegionRepo, authorizationService);
  const getInspectorUseCase = new GetInspectorUseCase(inspectorRepo, serviceRegionRepo);
  const listInspectorsUseCase = new ListInspectorsUseCase(inspectorRepo, serviceRegionRepo);
  const updateInspectorUseCase = new UpdateInspectorUseCase(inspectorRepo, auditService, serviceRegionRepo, authorizationService);
  const createAvailabilitySlotUseCase = new CreateAvailabilitySlotUseCase(inspectorRepo, availabilitySlotRepo, auditService);
  const listAvailabilitySlotsUseCase = new ListAvailabilitySlotsUseCase(availabilitySlotRepo);
  const updateAvailabilitySlotUseCase = new UpdateAvailabilitySlotUseCase(availabilitySlotRepo, auditService);
  const linkInspectorToUserUseCase = new LinkInspectorToUserUseCase(inspectorRepo, userManagementRepo, auditService, authorizationService);
  const inspectorAppointmentChecker = new PrismaInspectorAppointmentChecker(prisma);
  const deactivateInspectorUseCase = new DeactivateInspectorUseCase(inspectorRepo, inspectorAppointmentChecker, auditService, authorizationService);
  const generateInspectorPhotoUploadUrlUseCase = new GenerateInspectorPhotoUploadUrlUseCase(inspectorRepo, storageService, auditService);
  const confirmInspectorPhotoUploadUseCase = new ConfirmInspectorPhotoUploadUseCase(inspectorRepo, storageService, auditService);
  const updateInspectorSelfProfileUseCase = new UpdateInspectorSelfProfileUseCase(inspectorRepo, auditService);
  const generateInspectorDocumentUploadUrlUseCase = new GenerateInspectorDocumentUploadUrlUseCase(inspectorRepo, storageService, auditService);
  const confirmInspectorDocumentUploadUseCase = new ConfirmInspectorDocumentUploadUseCase(inspectorRepo, storageService, auditService);
  const getInspectorDocumentDownloadUrlUseCase = new GetInspectorDocumentDownloadUrlUseCase(inspectorRepo, storageService);
  const getInspectorAvailabilityTemplateUseCase = new GetInspectorAvailabilityTemplateUseCase(inspectorRepo, availabilitySlotRepo);
  const updateInspectorAvailabilityTemplateUseCase = new UpdateInspectorAvailabilityTemplateUseCase(inspectorRepo, availabilitySlotRepo, auditService);
  const getInspectorAvailabilityTemplateForOperatorUseCase = new GetInspectorAvailabilityTemplateForOperatorUseCase(inspectorRepo, availabilitySlotRepo);

  // Notification repositories and create use case (needed before appointments for handler wiring)
  const notificationRepo = new PrismaNotificationRepository(prisma);
  const notificationTemplateRepo = new PrismaNotificationTemplateRepository(prisma);
  const notificationJobQueue = env.ENABLE_JOB_QUEUE === 'true'
    ? new PgBossJobQueue()
    : new StubJobQueue();
  const createNotificationUseCase = new CreateNotificationUseCase(
    notificationRepo,
    notificationTemplateRepo,
    notificationJobQueue,
    logger,
  );

  // Password reset use cases (depend on createNotificationUseCase)
  const requestPasswordResetUseCase = new RequestPasswordResetUseCase(userRepo, passwordResetTokenRepo, createNotificationUseCase, auditService);
  const consumePasswordResetUseCase = new ConsumePasswordResetUseCase(passwordResetTokenRepo, userRepo, sessionRepo, auditService, passwordHistoryRepo);
  const acceptInviteUseCase = new AcceptInviteUseCase(passwordResetTokenRepo, userRepo, auditService);

  // Invite user use case (depends on createNotificationUseCase)
  const inviteUserUseCase = new InviteUserUseCase(userManagementRepo, tenantRepo, branchRepo, passwordResetTokenRepo, createNotificationUseCase, auditService, authorizationService);

  // Shared idempotency service (used across modules)
  const idempotencyService = new PrismaIdempotencyService(prisma);

  // Billing repositories (needed before appointments for onDoneHandler wiring)
  const financialEntryRepo = new PrismaFinancialEntryRepository(prisma);
  const inspectorInvoiceRepo = new PrismaInspectorInvoiceRepository(prisma);

  // Appointment time slot
  const createTenantUseCase = new CreateTenantUseCase(tenantRepo, auditService, authorizationService, domainEventBus);

  // Appointment repositories and use cases
  const appointmentRepo = new PrismaAppointmentRepository(prisma);
  const createFinancialEntriesOnDoneUseCase = new CreateFinancialEntriesOnDoneUseCase(
    appointmentRepo, financialEntryRepo, auditService, idempotencyService, tenantRepo,
  );
  const createAppointmentUseCase = new CreateAppointmentUseCase(
    appointmentRepo, branchRepo, propertyRepo, serviceTypeRepo, pricingRuleRepo,
    createPropertyUseCase, auditService, authorizationService, tenantRepo, contactRepo,
    undefined, idempotencyService, appCredentialRepo,
  );
  const getAppointmentUseCase = new GetAppointmentUseCase(appointmentRepo, authorizationService, appCredentialRepo);
  const listAppointmentsUseCase = new ListAppointmentsUseCase(appointmentRepo, authorizationService);
  // updateAppointmentUseCase is constructed AFTER the notification handlers below —
  // schedule edits need confirmationCycleService + portal token repo + reschedule notifier.
  const deleteAppointmentUseCase = new DeleteAppointmentUseCase(appointmentRepo, auditService, authorizationService);
  const bulkEditAppointmentsUseCase = new BulkEditAppointmentsUseCase(
    appointmentRepo, contactRepo, inspectorRepo, pricingRuleRepo,
    auditService, authorizationService,
  );
  // Tenant portal repositories — created BEFORE reopenForRescheduleUseCase
  // so 026 §FR-543 can inject the token repo (revoke active portal tokens
  // when the appointment is rescheduled).
  const rentalTenantPortalTokenRepo = new PrismaRentalTenantPortalTokenRepository(prisma);
  const rentalTenantPortalActivityRepo = new PrismaRentalTenantPortalActivityRepository(prisma);
  const tokenService = new TokenService();

  // 028 — confirmation cycle repository + service
  const confirmationCycleRepo = new PrismaConfirmationCycleRepository(prisma);
  const confirmationCycleService = new ConfirmationCycleService(confirmationCycleRepo, auditService, prisma);

  // 028 — AES-256-GCM token encrypter (optional; skipped when PORTAL_TOKEN_ENC_KEY absent)
  const portalTokenEncrypter = env.PORTAL_TOKEN_ENC_KEY
    ? new AesTokenEncrypterAdapter(new Aes256GcmService(env.PORTAL_TOKEN_ENC_KEY))
    : undefined;

  const mintPortalTokenService = new MintPortalTokenService(rentalTenantPortalTokenRepo, tokenService, portalTokenEncrypter);

  const forceManualConfirmationUseCase = new ForceManualTenantConfirmationUseCase(appointmentRepo, auditService, authorizationService, confirmationCycleService);

  const reopenForRescheduleUseCase = new ReopenForRescheduleUseCase(
    appointmentRepo,
    auditService,
    authorizationService,
    rentalTenantPortalTokenRepo,
    confirmationCycleService,
    prisma,
  );

  // Notification payload helpers — no constructor deps, safe to create here
  const appointmentCodeFormatter = new AppointmentCodeFormatter();
  const buildNotificationPayload = new BuildNotificationPayloadService();

  // Notification handlers: depend on mintPortalTokenService + buildNotificationPayload
  const notifyOnStatusTransitionHandler = new NotifyOnStatusTransitionHandler(
    appointmentRepo, propertyRepo, tenantRepo, notificationRepo,
    mintPortalTokenService, buildNotificationPayload, appointmentCodeFormatter,
    createNotificationUseCase, env.TENANT_PORTAL_BASE_URL, logger, metrics,
  );
  const notifyOnRentalTenantPortalActionHandler = new NotifyOnRentalTenantPortalActionHandler(
    appointmentRepo, propertyRepo, tenantRepo, notificationRepo,
    buildNotificationPayload, appointmentCodeFormatter,
    createNotificationUseCase, env.TENANT_PORTAL_BASE_URL, logger, metrics,
  );
  const notifyOnAdminRescheduleHandler = new NotifyOnAdminRescheduleHandler(
    appointmentRepo, propertyRepo, tenantRepo,
    mintPortalTokenService, buildNotificationPayload, appointmentCodeFormatter,
    createNotificationUseCase, env.TENANT_PORTAL_BASE_URL, logger, metrics,
  );

  // Schedule edits in any non-terminal status: rotates the confirmation cycle,
  // revokes stale portal tokens and (for SCHEDULED) notifies the rental tenant.
  // `serviceGroupRepo` here validates a grouped appointment's new time slot
  // against the group's time window (the full instance is re-created below
  // for the service-group module's own use cases).
  const updateAppointmentUseCase = new UpdateAppointmentUseCase(
    appointmentRepo, auditService, authorizationService, tenantRepo, contactRepo,
    undefined, appCredentialRepo,
    confirmationCycleService, rentalTenantPortalTokenRepo, notifyOnAdminRescheduleHandler,
    new PrismaServiceGroupRepository(prisma),
  );

  const executeStatusTransitionUseCase = new ExecuteStatusTransitionUseCase(
    appointmentRepo, userManagementRepo, inspectorRepo, idempotencyService, auditService,
    authorizationService,
    createFinancialEntriesOnDoneUseCase,
    notifyOnStatusTransitionHandler,
    serviceTypeRepo,
    domainEventBus,
    confirmationCycleService,
    prisma,
  );

  const getPortalDataUseCase = new GetPortalDataUseCase(rentalTenantPortalTokenRepo, rentalTenantPortalActivityRepo, appointmentRepo, propertyRepo, serviceTypeRepo, tenantRepo);
  const confirmAppointmentUseCase = new ConfirmAppointmentUseCase(rentalTenantPortalActivityRepo, appointmentRepo, auditService, notifyOnRentalTenantPortalActionHandler, domainEventBus, rentalTenantPortalTokenRepo, confirmationCycleService);
  const updateContactUseCase = new UpdateContactUseCase(rentalTenantPortalActivityRepo, appointmentRepo, auditService, domainEventBus, contactRepo);
  const generatePortalTokenUseCase = new GeneratePortalTokenUseCase(rentalTenantPortalTokenRepo, appointmentRepo, tenantRepo, mintPortalTokenService, auditService, env.TENANT_PORTAL_BASE_URL, createNotificationUseCase, confirmationCycleService, prisma, logger);
  const getPortalLinkUseCase = portalTokenEncrypter
    ? new GetPortalLinkUseCase(appointmentRepo, rentalTenantPortalTokenRepo, portalTokenEncrypter, env.TENANT_PORTAL_BASE_URL, authorizationService, auditService)
    : undefined;
  const listPortalActivitiesUseCase = new ListPortalActivitiesUseCase(rentalTenantPortalActivityRepo, appointmentRepo);
  const bulkResendReminderUseCase = new BulkResendReminderUseCase(generatePortalTokenUseCase, idempotencyService);

  // 025 — bulk map-flow actions (cancel / reschedule / status-transition / assign-inspector).
  // Each delegates to an existing single-item use case; the wrapper adds per-item idempotency
  // and the typed result envelope. State machine sovereignty stays with the underlying use cases.
  const bulkCancelAppointmentsUseCase = new BulkCancelAppointmentsUseCase(executeStatusTransitionUseCase, idempotencyService);
  const bulkRescheduleAppointmentsUseCase = new BulkRescheduleAppointmentsUseCase(updateAppointmentUseCase, idempotencyService);
  const bulkStatusTransitionUseCase = new BulkStatusTransitionUseCase(executeStatusTransitionUseCase, idempotencyService);
  const bulkAssignInspectorUseCase = new BulkAssignInspectorUseCase(bulkEditAppointmentsUseCase, idempotencyService);

  // 026 — bulk reopen for reschedule + add-to-group flow. The reopen wrapper
  // delegates per-item to ReopenForRescheduleUseCase (which now also revokes
  // active portal tokens — see container ordering above).
  const bulkReopenForRescheduleUseCase = new BulkReopenForRescheduleUseCase(
    reopenForRescheduleUseCase,
    appointmentRepo,
    idempotencyService,
  );

  // Inspector execution repositories and services
  const inspectionExecutionRepo = new PrismaInspectionExecutionRepository(prisma);
  const serviceTypeReaderForExec = new PrismaServiceTypeReader(prisma);
  const contactReaderForExec = new PrismaContactReader(prisma);
  const tenantSettingsReader = new PrismaTenantSettingsReader(prisma);
  const performCrossCheckUseCase = new PerformCrossCheckUseCase(
    appointmentRepo,
    auditLogRepo,
    inspectionExecutionRepo,
    auditService,
    authorizationService,
    createFinancialEntriesOnDoneUseCase,
  );
  const reportUnavailabilityUseCase = new ReportUnavailabilityUseCase(
    rentalTenantPortalActivityRepo,
    appointmentRepo,
    auditService,
    notifyOnRentalTenantPortalActionHandler,
    inspectionExecutionRepo,
    domainEventBus,
    rentalTenantPortalTokenRepo,
    confirmationCycleService,
  );

  const rescheduleRequestUseCase = new RescheduleRequestUseCase(rentalTenantPortalActivityRepo, rentalTenantPortalTokenRepo, appointmentRepo, serviceTypeRepo, inspectionExecutionRepo, tenantRepo, auditService, reopenForRescheduleUseCase, notifyOnRentalTenantPortalActionHandler, domainEventBus, generatePortalTokenUseCase);

  // Inspector execution use cases
  const getInspectorScheduleUseCase = new GetInspectorScheduleUseCase(
    appointmentRepo, inspectionExecutionRepo, authorizationService,
  );
  const getAppointmentDetailUseCase = new GetAppointmentDetailUseCase(
    appointmentRepo, inspectionExecutionRepo, serviceTypeReaderForExec, authorizationService, tenantRepo, appCredentialRepo,
    contactReaderForExec, logger,
  );
  const startInspectionUseCase = new StartInspectionUseCase(
    appointmentRepo, inspectionExecutionRepo, idempotencyService, auditService, tenantSettingsReader, authorizationService,
  );
  const finishInspectionUseCase = new FinishInspectionUseCase(
    inspectionExecutionRepo, idempotencyService,
    executeStatusTransitionUseCase, appointmentRepo, auditService, authorizationService,
  );
  const getAvailablePeriodsUseCase = new GetAvailablePeriodsUseCase(inspectorRepo);
  const getInspectorEarningsSummaryUseCase = new GetInspectorEarningsSummaryUseCase(financialEntryRepo);
  const previewInvoiceUseCase = new PreviewInvoiceUseCase(inspectorRepo, financialEntryRepo);
  const requestInvoiceUseCase = new RequestInvoiceUseCase(inspectorInvoiceRepo, financialEntryRepo, inspectorRepo, auditService);
  const saveExecutionProgressUseCase = new SaveExecutionProgressUseCase(
    inspectionExecutionRepo, authorizationService,
  );
  const reopenExecutionUseCase = new ReopenExecutionUseCase(
    inspectionExecutionRepo, appointmentRepo, auditService, authorizationService,
  );

  // Audit use cases
  const listAuditLogsUseCase = new ListAuditLogsUseCase(
    auditLogRepo,
    userManagementRepo,
    piiFieldMappingRepo,
    tenantRepo,
  );

  // Feature 020: data subject erasure workflow (AM-only, LGPD compliance)
  const erasurePiiResolver = new PrismaErasurePiiResolver(userManagementRepo, auditLogRepo);
  const previewDataSubjectErasureUseCase = new PreviewDataSubjectErasureUseCase(
    dataSubjectErasureRequestRepo,
    auditLogRepo,
    piiFieldMappingRepo,
    erasurePiiResolver,
    prisma,
  );
  const executeDataSubjectErasureUseCase = new ExecuteDataSubjectErasureUseCase(
    dataSubjectErasureRequestRepo,
    auditLogRepo,
    piiFieldMappingRepo,
    erasurePiiResolver,
    auditService,
    prisma,
    logger,
  );
  const getDataSubjectErasureRequestUseCase = new GetDataSubjectErasureRequestUseCase(
    dataSubjectErasureRequestRepo,
  );
  const listDataSubjectErasureRequestsUseCase = new ListDataSubjectErasureRequestsUseCase(
    dataSubjectErasureRequestRepo,
  );

  // Service group repositories and use cases
  const serviceGroupRepo = new PrismaServiceGroupRepository(prisma);
  const createServiceGroupUseCase = new CreateServiceGroupUseCase(serviceGroupRepo, appointmentRepo, auditService, authorizationService, serviceRegionRepo, undefined, logger);
  const getServiceGroupUseCase = new GetServiceGroupUseCase(serviceGroupRepo, authorizationService);
  const listServiceGroupsUseCase = new ListServiceGroupsUseCase(serviceGroupRepo, authorizationService);
  const publishServiceGroupUseCase = new PublishServiceGroupUseCase(serviceGroupRepo, auditService, serviceRegionRepo, authorizationService, domainEventBus);
  const assignInspectorManuallyUseCase = new AssignInspectorManuallyUseCase(serviceGroupRepo, inspectorRepo, auditService, serviceRegionRepo, idempotencyService, authorizationService, domainEventBus, availabilitySlotRepo);
  const acceptOfferUseCase = new AcceptOfferUseCase(serviceGroupRepo, inspectorRepo, auditService, idempotencyService, authorizationService, domainEventBus, availabilitySlotRepo);
  const getMarketplaceOffersUseCase = new GetMarketplaceOffersUseCase(serviceGroupRepo, inspectorRepo, authorizationService);
  const getMarketplaceOfferDetailUseCase = new GetMarketplaceOfferDetailUseCase(serviceGroupRepo, inspectorRepo, authorizationService);
  const cancelServiceGroupUseCase = new CancelServiceGroupUseCase(serviceGroupRepo, auditService, authorizationService, domainEventBus);
  const rejectServiceGroupUseCase = new RejectServiceGroupUseCase(serviceGroupRepo, auditService, authorizationService, domainEventBus);
  const updateServiceGroupUseCase = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService, authorizationService, appointmentRepo, logger);
  const republishServiceGroupUseCase = new RepublishServiceGroupUseCase(serviceGroupRepo, auditService, authorizationService);

  const getAvailableGroupsUseCase = new GetAvailableGroupsUseCase(appointmentRepo, serviceGroupRepo);
  const joinGroupUseCase = new JoinGroupUseCase(
    appointmentRepo,
    serviceGroupRepo,
    rentalTenantPortalActivityRepo,
    rentalTenantPortalTokenRepo,
    auditService,
    executeStatusTransitionUseCase,
    notifyOnRentalTenantPortalActionHandler,
  );

  // 026 — Add appointments to existing group + read-only eligibility preview.
  const addAppointmentsToGroupUseCase = new AddAppointmentsToGroupUseCase(
    serviceGroupRepo,
    appointmentRepo,
    auditService,
    authorizationService,
    logger,
  );
  const checkAppointmentsEligibilityForGroupUseCase = new CheckAppointmentsEligibilityForGroupUseCase(
    serviceGroupRepo,
    appointmentRepo,
    authorizationService,
  );
  const findAddableGroupsForAppointmentsUseCase = new FindAddableGroupsForAppointmentsUseCase(
    serviceGroupRepo,
    appointmentRepo,
    authorizationService,
  );

  // Group "Send portal link" — preview + execute. Reuses the per-appointment
  // GeneratePortalTokenUseCase and the bulk-resend idempotency bucket.
  const getGroupPortalLinkPlanUseCase = new GetGroupPortalLinkPlanUseCase(
    serviceGroupRepo,
    authorizationService,
  );
  const sendGroupPortalLinksUseCase = new SendGroupPortalLinksUseCase(
    serviceGroupRepo,
    generatePortalTokenUseCase,
    confirmationCycleService,
    idempotencyService,
    auditService,
    authorizationService,
  );

  // Billing use cases (repos + createFinancialEntriesOnDoneUseCase created above)
  const listFinancialEntriesUseCase = new ListFinancialEntriesUseCase(financialEntryRepo, auditService);
  const getFinancialSummaryUseCase = new GetFinancialSummaryUseCase(financialEntryRepo, tenantRepo);
  const getFinancialEntryUseCase = new GetFinancialEntryUseCase(financialEntryRepo);
  const approveFinancialEntryUseCase = new ApproveFinancialEntryUseCase(financialEntryRepo, auditService, authorizationService);
  const cancelFinancialEntryUseCase = new CancelFinancialEntryUseCase(financialEntryRepo, auditService, authorizationService);
  const createManualAdjustmentUseCase = new CreateManualAdjustmentUseCase(
    financialEntryRepo,
    auditService,
    idempotencyService,
    tenantRepo,
    appointmentRepo,
    inspectorRepo,
    authorizationService,
  );
  const createRefundUseCase = new CreateRefundUseCase(financialEntryRepo, auditService, idempotencyService, authorizationService);
  const billingJobQueue = env.ENABLE_JOB_QUEUE === 'true'
    ? new PgBossJobQueue()
    : new StubJobQueue();
  const reportStorageService = s3Client
    ? new SupabaseReportStorageService(s3Client, env.SUPABASE_STORAGE_BUCKET)
    : new StubReportStorageService();
  const listInvoicesUseCase = new ListInvoicesUseCase(inspectorInvoiceRepo);
  const getInvoiceUseCase = new GetInvoiceUseCase(inspectorInvoiceRepo);
  const downloadInvoiceUseCase = new DownloadInvoiceUseCase(
    inspectorInvoiceRepo,
    reportStorageService,
  );
  const markInvoicePaidUseCase = new MarkInvoicePaidUseCase(inspectorInvoiceRepo, auditService, authorizationService);
  const batchMarkInvoicesPaidUseCase = new BatchMarkInvoicesPaidUseCase(inspectorInvoiceRepo, auditService, authorizationService);
  const reverseInvoicePaymentUseCase = new ReverseInvoicePaymentUseCase(inspectorInvoiceRepo, auditService, authorizationService);
  const getReconciliationSummaryUseCase = new GetReconciliationSummaryUseCase(inspectorInvoiceRepo, authorizationService);
  const getInvoiceSummaryUseCase = new GetInvoiceSummaryUseCase(inspectorInvoiceRepo, authorizationService);
  const voidFinancialEntryUseCase = new VoidFinancialEntryUseCase(financialEntryRepo, auditService, authorizationService);
  const approveDraftInvoiceUseCase = new ApproveDraftInvoiceUseCase(inspectorInvoiceRepo, financialEntryRepo, auditService, authorizationService, billingJobQueue);
  const rejectDraftInvoiceUseCase = new RejectDraftInvoiceUseCase(inspectorInvoiceRepo, auditService, authorizationService);

  // Report repositories and use cases
  const reportRepo = new PrismaReportRepository(prisma);
  const xlsxGenerator = new ExcelJsXlsxGenerator();
  // 031 — agency financial statement export reuses the report XLSX generator.
  const exportAgencyFinancialUseCase = new ExportAgencyFinancialUseCase(financialEntryRepo, tenantRepo, xlsxGenerator);
  const reportDataReader = new PrismaReportDataReader(prisma);
  const reportJobQueue = env.ENABLE_JOB_QUEUE === 'true'
    ? new PgBossJobQueue()
    : new StubJobQueue();
  const requestReportUseCase = new RequestReportUseCase(reportRepo, reportJobQueue, auditService);
  const getReportStatusUseCase = new GetReportStatusUseCase(reportRepo, userManagementRepo, reportStorageService);
  const downloadReportUseCase = new DownloadReportUseCase(reportRepo, reportStorageService);
  const listReportsUseCase = new ListReportsUseCase(reportRepo, userManagementRepo, reportStorageService);
  const processReportJobUseCase = new ProcessReportJobUseCase(
    reportRepo,
    reportStorageService,
    xlsxGenerator,
    reportDataReader,
    createNotificationUseCase,
    userManagementRepo,
  );

  // Notification providers and services (notificationRepo + notificationTemplateRepo created above)
  const notificationAttemptRepo = new PrismaNotificationAttemptRepository(prisma);
  const emailProvider = new DynamicEmailProvider(integrationConfigResolver);
  const smsProvider = new DynamicSmsProvider(integrationConfigResolver);
  const templateRenderer = new TemplateRendererService();
  const htmlSanitizer = new SanitizeHtmlService();
  const htmlToText = new HtmlToTextService();

  // Email assets (US2)
  const emailAssetRepo = new PrismaEmailAssetRepository(prisma);
  const templateImageBindingRepo = new PrismaTemplateImageBindingRepository(prisma);
  const imageContentVerifier = new ImageContentVerifier();
  const emailAssetStorage = env.SUPABASE_S3_ENDPOINT && env.EMAIL_ASSETS_PUBLIC_URL_BASE
    ? new SupabaseEmailAssetStorageService(
        new S3Client({
          endpoint: env.SUPABASE_S3_ENDPOINT,
          region: 'us-east-1',
          credentials: {
            accessKeyId: env.SUPABASE_S3_ACCESS_KEY_ID ?? '',
            secretAccessKey: env.SUPABASE_S3_SECRET_ACCESS_KEY ?? '',
          },
          forcePathStyle: true,
        }),
        env.EMAIL_ASSETS_BUCKET,
        env.EMAIL_ASSETS_PUBLIC_URL_BASE,
      )
    : null;

  // Notification use cases
  const consentRepo = new PrismaNotificationConsentRepository(prisma);
  const getTenantSettings = async (tenantId: string): Promise<Record<string, unknown>> => {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings_json: true } });
    return (tenant?.settings_json as Record<string, unknown>) ?? {};
  };
  const imagePlaceholderResolver = new ImagePlaceholderResolver();

  const sendNotificationUseCase = new SendNotificationUseCase({
    notificationRepo,
    templateRepo: notificationTemplateRepo,
    consentRepo,
    attemptRepo: notificationAttemptRepo,
    emailProvider,
    smsProvider,
    templateRenderer,
    logger,
    metrics,
    getTenantSettings,
    // Feature 030: image-resolve → render → sanitize pipeline
    htmlSanitizer,
    htmlToText,
    imagePlaceholderResolver,
    emailAssetRepo,
    templateImageBindingRepo,
    emailAssetsPublicUrlBase: env.EMAIL_ASSETS_PUBLIC_URL_BASE,
  });
  const retryNotificationUseCase = new RetryNotificationUseCase(notificationRepo, auditService, authorizationService);
  const handleProviderWebhookUseCase = new HandleProviderWebhookUseCase(notificationRepo, logger);
  const webhookSignatureValidator = createWebhookSignatureValidator({
    resendWebhookSecret: env.RESEND_WEBHOOK_SECRET,
  });
  const listNotificationsUseCase = new ListNotificationsUseCase(notificationRepo, authorizationService);
  const getNotificationUseCase = new GetNotificationUseCase(notificationRepo, authorizationService);
  const upsertNotificationTemplateUseCase = new UpsertNotificationTemplateUseCase(
    notificationTemplateRepo, templateRenderer, auditService, authorizationService,
    htmlSanitizer, htmlToText, emailAssetRepo, templateImageBindingRepo,
  );
  const deleteNotificationTemplateUseCase = new DeleteNotificationTemplateUseCase(
    notificationTemplateRepo, authorizationService, auditService,
  );
  const renderTemplatePreviewUseCase = new RenderTemplatePreviewUseCase(
    templateRenderer, htmlSanitizer, authorizationService,
    emailAssetRepo, env.EMAIL_ASSETS_PUBLIC_URL_BASE,
  );

  // Email asset use cases (US2)
  const requestImageUploadUseCase = emailAssetStorage
    ? new RequestImageUploadUseCase(emailAssetRepo, emailAssetStorage, auditService, authorizationService)
    : null;
  const confirmImageUploadUseCase = emailAssetStorage
    ? new ConfirmImageUploadUseCase(emailAssetRepo, emailAssetStorage, imageContentVerifier, auditService, authorizationService)
    : null;
  const listEmailAssetsUseCase = new ListEmailAssetsUseCase(emailAssetRepo, authorizationService);
  const editImageBindingUseCase = new EditImageBindingUseCase(templateImageBindingRepo, emailAssetRepo, authorizationService);
  const deleteEmailAssetUseCase = emailAssetStorage
    ? new DeleteEmailAssetUseCase(emailAssetRepo, templateImageBindingRepo, emailAssetStorage, auditService, authorizationService)
    : null;

  const sendTestNotificationUseCase = new SendTestNotificationUseCase(
    notificationTemplateRepo, templateRenderer, emailProvider, smsProvider, auditService, authorizationService,
    env.EMAIL_TEST_RECIPIENT_ALLOWLIST,
    {
      htmlSanitizer,
      htmlToText,
      imagePlaceholderResolver,
      emailAssetRepo,
      templateImageBindingRepo,
      emailAssetsPublicUrlBase: env.EMAIL_ASSETS_PUBLIC_URL_BASE,
    },
  );
  const listNotificationTemplatesUseCase = new ListNotificationTemplatesUseCase(
    notificationTemplateRepo, authorizationService, templateImageBindingRepo, emailAssetRepo,
  );
  // createNotificationUseCase and notificationJobQueue created above (before appointments)
  const pollRetryableNotificationsUseCase = new PollRetryableNotificationsUseCase(notificationRepo, notificationJobQueue, logger);
  const pollSmsDeliveryUseCase = new PollSmsDeliveryUseCase(notificationRepo, smsProvider, logger);
  const dispatchRemindersUseCase = new DispatchRemindersUseCase(
    appointmentRepo, tenantRepo, notificationRepo,
    buildNotificationPayload, appointmentCodeFormatter,
    createNotificationUseCase, env.TENANT_PORTAL_BASE_URL,
  );
  const dispatchEscalationsUseCase = new DispatchEscalationsUseCase(
    appointmentRepo, branchRepo, tenantRepo, notificationRepo,
    buildNotificationPayload, appointmentCodeFormatter,
    createNotificationUseCase, env.TENANT_PORTAL_BASE_URL,
  );
  const listConsentsByRecipientUseCase = new ListConsentsByRecipientUseCase(
    consentRepo,
    authorizationService,
  );
  const overrideConsentUseCase = new OverrideConsentUseCase(
    consentRepo,
    authorizationService,
    auditService,
  );

  // Dashboard repositories and use cases
  const dashboardRepo = new PrismaDashboardRepository(prisma);
  const getDashboardStatsUseCase = new GetDashboardStatsUseCase(dashboardRepo);

  // Service region use cases (serviceRegionRepo instantiated earlier for inspector/marketplace use)
  const createServiceRegionUseCase = new CreateServiceRegionUseCase(serviceRegionRepo, auditService, authorizationService);
  const updateServiceRegionUseCase = new UpdateServiceRegionUseCase(serviceRegionRepo, auditService, authorizationService);
  const getServiceRegionUseCase = new GetServiceRegionUseCase(serviceRegionRepo, authorizationService, userRepo);
  const listServiceRegionsUseCase = new ListServiceRegionsUseCase(serviceRegionRepo, authorizationService);
  const deactivateServiceRegionUseCase = new DeactivateServiceRegionUseCase(serviceRegionRepo, auditService, authorizationService, domainEventBus);
  const deleteServiceRegionUseCase = new DeleteServiceRegionUseCase(serviceRegionRepo, auditService, authorizationService);
  const resolveRegionsUseCase = new ResolveRegionsUseCase(serviceRegionRepo, authorizationService);

  // Service region event handlers
  const notifyInspectorsOnRegionDeactivationHandler = new NotifyInspectorsOnRegionDeactivationHandler(
    inspectorRepo, createNotificationUseCase,
  );
  domainEventBus.subscribe(
    SERVICE_REGION_EVENTS.DEACTIVATED,
    (event) => notifyInspectorsOnRegionDeactivationHandler.handle(event),
  );

  // Appointment event handlers
  const compensateFinancialOnDoneRejectedHandler = new CompensateFinancialOnDoneRejectedHandler(
    financialEntryRepo, auditService,
  );
  domainEventBus.subscribe(
    APPOINTMENT_EVENTS.DONE_REJECTED,
    (event) => compensateFinancialOnDoneRejectedHandler.handle(event),
  );

  // Appointment import — preview/commit split (depends on reportStorageService and job queue)
  const appointmentImportRepo = new PrismaAppointmentImportRepository(prisma);
  const fyRepo = new PrismaFyRepository(prisma);
  const importJobQueue = env.ENABLE_JOB_QUEUE === 'true'
    ? new PgBossJobQueue()
    : new StubJobQueue();
  // Fy outbound webhooks: subscriber enqueues, worker delivers with retry.
  const fyWebhookDispatcher = new FyWebhookDispatcher(integrationConfigResolver);
  new FyWebhookSubscriber(integrationConfigResolver, fyRepo, importJobQueue, logger).register(domainEventBus);

  const appointmentImportRowResolver = new AppointmentImportRowResolver(
    propertyRepo, serviceTypeRepo, pricingRuleRepo, contactRepo,
  );
  const appointmentImportGeocodeVerifier = new ImportGeocodeVerifier(geocodingService);
  const previewAppointmentImportUseCase = new PreviewAppointmentImportUseCase(
    appointmentImportRepo, reportStorageService, branchRepo, appointmentImportRowResolver,
    appointmentImportGeocodeVerifier, authorizationService,
  );
  const commitAppointmentImportUseCase = new CommitAppointmentImportUseCase(
    appointmentImportRepo, importJobQueue, authorizationService, idempotencyService,
  );
  const exportAppointmentImportErrorsUseCase = new ExportAppointmentImportErrorsUseCase(
    appointmentImportRepo, authorizationService,
  );
  const getImportStatusUseCase = new GetImportStatusUseCase(appointmentImportRepo, authorizationService);

  // Workers
  const cleanupSessionsWorker = new CleanupSessionsWorker(sessionRepo, logger);
  const keyExpiryCheckWorker = new KeyExpiryCheckWorker(jwtService, auditService, logger);
  const expireFilesWorker = new ExpireFilesWorker(reportRepo, reportStorageService, logger);
  const invoicePdfGenerator = new PdfKitInvoicePdfGenerator();
  const generateInvoiceFileWorker = new GenerateInvoiceFileWorker(
    inspectorInvoiceRepo, invoicePdfGenerator, reportStorageService, logger,
  );
  const expireTokensWorker = new ExpireTokensWorker(rentalTenantPortalTokenRepo, logger);
  const notifyStuckInspectionsWorker = new NotifyStuckInspectionsWorker(
    inspectionExecutionRepo, appointmentRepo, notificationRepo, createNotificationUseCase, logger,
  );
  const auditRetentionWorker = new AuditRetentionWorker(
    prisma,
    auditLogRepo,
    auditRetentionCategoryRepo,
    auditLegalHoldRepo,
    auditPreservationRuleRepo,
    auditService,
    logger,
    env.AUDIT_RETENTION_BATCH_SIZE,
  );

  // Reject unconfirmed appointments cleanup worker
  const rejectUnconfirmedAppointmentsUseCase = new RejectUnconfirmedAppointmentsUseCase(
    appointmentRepo, serviceGroupRepo, auditService, logger, confirmationCycleService, prisma,
  );
  const rejectUnconfirmedWorker = new RejectUnconfirmedWorker(rejectUnconfirmedAppointmentsUseCase);

  // Feature 020 US5: operator control use cases
  const upsertRetentionCategoryUseCase = new UpsertRetentionCategoryUseCase(
    auditRetentionCategoryRepo,
    auditService,
  );
  const upsertPreservationRuleUseCase = new UpsertPreservationRuleUseCase(
    auditPreservationRuleRepo,
    auditService,
  );
  const placeLegalHoldUseCase = new PlaceLegalHoldUseCase(auditLegalHoldRepo, auditService);
  const releaseLegalHoldUseCase = new ReleaseLegalHoldUseCase(auditLegalHoldRepo, auditService);
  const upsertPiiFieldMappingUseCase = new UpsertPiiFieldMappingUseCase(
    piiFieldMappingRepo,
    auditService,
  );
  const triggerRetentionRunUseCase = new TriggerRetentionRunUseCase(
    auditRetentionWorker,
    auditService,
  );
  const listRetentionRunsUseCase = new ListRetentionRunsUseCase(auditLogRepo);

  const appointmentImportCommitWorker = new AppointmentImportCommitWorker(
    appointmentImportRepo, reportStorageService, propertyRepo, appointmentImportRowResolver,
    createAppointmentUseCase, importJobQueue, auditService, logger,
  );
  const sweepAbandonedAppointmentImportsWorker = new SweepAbandonedAppointmentImportsWorker(
    appointmentImportRepo, reportStorageService, logger,
  );

  return {
    prisma,
    auditService,
    domainEventBus,
    auth: {
      loginUseCase,
      refreshTokenUseCase,
      logoutUseCase,
      getMeUseCase,
      changePasswordUseCase,
      revokeSessionUseCase,
      listSessionsUseCase,
      setupTotpUseCase,
      confirmTotpUseCase,
      requestPasswordResetUseCase,
      consumePasswordResetUseCase,
      acceptInviteUseCase,
      jwtService,
      tenantRepo,
    },
    tenant: {
      createTenantUseCase,
      getTenantUseCase,
      listTenantsUseCase,
      updateTenantUseCase,
      activateTenantUseCase,
      deactivateTenantUseCase,
      createBranchUseCase,
      getBranchUseCase,
      listBranchesUseCase,
      updateBranchUseCase,
      deactivateBranchUseCase,
      activateBranchUseCase,
      generateLogoUploadUrlUseCase,
      confirmLogoUploadUseCase,
      jwtService,
      tenantRepo,
    },
    user: {
      createUserUseCase,
      getUserUseCase,
      listUsersUseCase,
      updateUserUseCase,
      deactivateUserUseCase,
      unlockUserUseCase,
      resetUserPasswordUseCase,
      inviteUserUseCase,
      jwtService,
      tenantRepo,
    },
    property: {
      createPropertyUseCase,
      getPropertyUseCase,
      listPropertiesUseCase,
      getPropertySummaryUseCase,
      updatePropertyUseCase,
      deletePropertyUseCase,
      geocodePropertyUseCase,
      searchAddressesUseCase,
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
      deactivateInspectorUseCase,
      generateInspectorPhotoUploadUrlUseCase,
      confirmInspectorPhotoUploadUseCase,
      updateInspectorSelfProfileUseCase,
      generateInspectorDocumentUploadUrlUseCase,
      confirmInspectorDocumentUploadUseCase,
      getInspectorDocumentDownloadUrlUseCase,
      getInspectorAvailabilityTemplateUseCase,
      updateInspectorAvailabilityTemplateUseCase,
      getInspectorAvailabilityTemplateForOperatorUseCase,
      jwtService,
      tenantRepo,
      slotRepo: availabilitySlotRepo,
    },
    appointment: {
      createAppointmentUseCase,
      getAppointmentUseCase,
      listAppointmentsUseCase,
      updateAppointmentUseCase,
      executeStatusTransitionUseCase,
      performCrossCheckUseCase,
      forceManualConfirmationUseCase,
      reopenForRescheduleUseCase,
      previewAppointmentImportUseCase,
      commitAppointmentImportUseCase,
      exportAppointmentImportErrorsUseCase,
      getImportStatusUseCase,
      deleteAppointmentUseCase,
      bulkEditAppointmentsUseCase,
      bulkResendReminderUseCase,
      bulkCancelAppointmentsUseCase,
      bulkRescheduleAppointmentsUseCase,
      bulkStatusTransitionUseCase,
      bulkAssignInspectorUseCase,
      bulkReopenForRescheduleUseCase,
      jwtService,
      tenantRepo,
      idempotencyService,
      getPortalLinkUseCase,
    },
    audit: {
      listAuditLogsUseCase,
      jwtService,
      tenantRepo,
    },
    auditErasure: {
      previewDataSubjectErasureUseCase,
      executeDataSubjectErasureUseCase,
      getDataSubjectErasureRequestUseCase,
      listDataSubjectErasureRequestsUseCase,
      jwtService,
      tenantRepo,
    },
    auditRetention: {
      upsertRetentionCategoryUseCase,
      upsertPreservationRuleUseCase,
      placeLegalHoldUseCase,
      releaseLegalHoldUseCase,
      upsertPiiFieldMappingUseCase,
      triggerRetentionRunUseCase,
      listRetentionRunsUseCase,
      retentionCategoryRepo: auditRetentionCategoryRepo,
      preservationRuleRepo: auditPreservationRuleRepo,
      legalHoldRepo: auditLegalHoldRepo,
      piiFieldMappingRepo,
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
      rejectServiceGroupUseCase,
      updateServiceGroupUseCase,
      republishServiceGroupUseCase,
      addAppointmentsToGroupUseCase,
      checkAppointmentsEligibilityForGroupUseCase,
      findAddableGroupsForAppointmentsUseCase,
      getGroupPortalLinkPlanUseCase,
      sendGroupPortalLinksUseCase,
      jwtService,
      tenantRepo,
    },
    marketplace: {
      getMarketplaceOffersUseCase,
      getMarketplaceOfferDetailUseCase,
      acceptOfferUseCase,
      jwtService,
      tenantRepo,
    },
    rentalTenantPortal: {
      getPortalDataUseCase,
      confirmAppointmentUseCase,
      rescheduleRequestUseCase,
      updateContactUseCase,
      reportUnavailabilityUseCase,
      generatePortalTokenUseCase,
      listPortalActivitiesUseCase,
      getAvailableGroupsUseCase,
      joinGroupUseCase,
      tokenRepo: rentalTenantPortalTokenRepo,
      tokenService,
      jwtService,
      tenantRepo,
    },
    inspectorExecution: {
      getInspectorScheduleUseCase,
      getAppointmentDetailUseCase,
      startInspectionUseCase,
      finishInspectionUseCase,
      saveExecutionProgressUseCase,
      reopenExecutionUseCase,
      getMarketplaceOffersUseCase,
      getAvailablePeriodsUseCase,
      getInspectorEarningsSummaryUseCase,
      previewInvoiceUseCase,
      requestInvoiceUseCase,
      jwtService,
      tenantRepo,
    },
    billing: {
      createFinancialEntriesOnDoneUseCase,
      getFinancialSummaryUseCase,
      listFinancialEntriesUseCase,
      getFinancialEntryUseCase,
      approveFinancialEntryUseCase,
      cancelFinancialEntryUseCase,
      createManualAdjustmentUseCase,
      createRefundUseCase,
      listInvoicesUseCase,
      getInvoiceUseCase,
      downloadInvoiceUseCase,
      markInvoicePaidUseCase,
      batchMarkInvoicesPaidUseCase,
      reverseInvoicePaymentUseCase,
      getReconciliationSummaryUseCase,
      getInvoiceSummaryUseCase,
      voidFinancialEntryUseCase,
      approveDraftInvoiceUseCase,
      rejectDraftInvoiceUseCase,
      exportAgencyFinancialUseCase,
      authorizationService,
      jwtService,
      tenantRepo,
    },
    report: {
      requestReportUseCase,
      getReportStatusUseCase,
      downloadReportUseCase,
      listReportsUseCase,
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
      deleteNotificationTemplateUseCase,
      renderTemplatePreviewUseCase,
      requestImageUploadUseCase: requestImageUploadUseCase as NonNullable<typeof requestImageUploadUseCase>,
      confirmImageUploadUseCase: confirmImageUploadUseCase as NonNullable<typeof confirmImageUploadUseCase>,
      listEmailAssetsUseCase,
      editImageBindingUseCase,
      deleteEmailAssetUseCase: deleteEmailAssetUseCase as NonNullable<typeof deleteEmailAssetUseCase>,
      sendTestNotificationUseCase,
      listNotificationTemplatesUseCase,
      createNotificationUseCase,
      pollRetryableNotificationsUseCase,
      pollSmsDeliveryUseCase,
      dispatchRemindersUseCase,
      dispatchEscalationsUseCase,
      listConsentsByRecipientUseCase,
      overrideConsentUseCase,
      jwtService,
      tenantRepo,
      webhookSignatureValidator,
      getMobileMessageWebhookToken: async () =>
        (await integrationConfigResolver.getConfig('mobile_message'))?.config['webhookToken']
        ?? env.MOBILE_MESSAGE_WEBHOOK_TOKEN,
    },
    dashboard: {
      getDashboardStatsUseCase,
      jwtService,
      tenantRepo,
    },
    serviceRegion: {
      createServiceRegionUseCase,
      updateServiceRegionUseCase,
      getServiceRegionUseCase,
      listServiceRegionsUseCase,
      deactivateServiceRegionUseCase,
      deleteServiceRegionUseCase,
      resolveRegionsUseCase,
      jwtService,
      tenantRepo,
    },
    contact: {
      createContactUseCase,
      updateContactUseCase: updateContactRegistryUseCase,
      getContactUseCase,
      listContactsUseCase,
      jwtService,
      tenantRepo,
    },
    appCredential: {
      createAppCredentialUseCase,
      updateAppCredentialUseCase,
      getAppCredentialUseCase,
      listAppCredentialsUseCase,
      jwtService,
      tenantRepo,
    },
    integration: {
      listIntegrationsUseCase: new ListIntegrationsUseCase(integrationSettingRepo, integrationConfigResolver),
      upsertIntegrationSettingUseCase: new UpsertIntegrationSettingUseCase(integrationSettingRepo, integrationConfigResolver, auditService),
      deleteIntegrationSettingUseCase: new DeleteIntegrationSettingUseCase(integrationSettingRepo, integrationConfigResolver, auditService),
      testIntegrationConnectionUseCase: new TestIntegrationConnectionUseCase(integrationConfigResolver, new HttpIntegrationConnectionTester()),
      integrationConfigResolver,
      createApiKeyUseCase: new CreateApiKeyUseCase(apiKeyRepo, auditService),
      listApiKeysUseCase: new ListApiKeysUseCase(apiKeyRepo),
      revokeApiKeyUseCase: new RevokeApiKeyUseCase(apiKeyRepo, auditService),
      jwtService,
      tenantRepo,
    },
    fy: (() => {
      // Composite auth: X-API-Key decides when present; otherwise JWT (whose
      // principals then fail the bot:fy scope gate — the Fy API is machine-only).
      const jwtAuthenticate = createAuthMiddleware(
        (token) => jwtService.verify(token),
        async (tenantId) => {
          const tenant = await tenantRepo.findById(tenantId);
          return tenant?.isActive() ?? false;
        },
      );
      return {
        apiKeyAuthenticate: createApiKeyAuthMiddleware(apiKeyRepo, jwtAuthenticate),
        findFyAppointmentsByPhoneUseCase: new FindFyAppointmentsByPhoneUseCase(fyRepo),
        getFyAppointmentUseCase: new GetFyAppointmentUseCase(
          appointmentRepo,
          rentalTenantPortalTokenRepo,
          portalTokenEncrypter ?? null,
          env.TENANT_PORTAL_BASE_URL,
          fyRepo,
        ),
        getFyAgencyUseCase: new GetFyAgencyUseCase(fyRepo),
        getFyAvailableDatesUseCase: new GetFyAvailableDatesUseCase(appointmentRepo, serviceGroupRepo),
        addFyAppointmentNoteUseCase: new AddFyAppointmentNoteUseCase(fyRepo, auditService),
        updateFyAppointmentContactUseCase: new UpdateFyAppointmentContactUseCase(appointmentRepo, contactRepo, auditService),
        resendFyNoticeUseCase: new ResendFyNoticeUseCase(generatePortalTokenUseCase, idempotencyService),
      };
    })(),
    fyWebhookDispatcher,
    cleanupSessionsWorker,
    keyExpiryCheckWorker,
    expireFilesWorker,
    processReportJobUseCase,
    geocodeWorker,
    geocodeRetryWorker,
    appointmentImportCommitWorker,
    sweepAbandonedAppointmentImportsWorker,
    generateInvoiceFileWorker,
    expireTokensWorker,
    notifyStuckInspectionsWorker,
    auditRetentionWorker,
    rejectUnconfirmedWorker,
  };
}
