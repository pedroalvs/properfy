import { z } from 'zod';

// ─── Common ────────────────────────────────────────────────────────────────

export const paginationMetaSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: paginationMetaSchema,
  });
}

export function successResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
  });
}

export const messageResponseSchema = z.object({
  message: z.string(),
});

// ─── Auth ──────────────────────────────────────────────────────────────────

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    role: z.string(),
    tenantId: z.string().uuid().nullable(),
  }),
});

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

export const meResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  tenantId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  totpEnabled: z.boolean(),
});

// ─── Tenant ────────────────────────────────────────────────────────────────

export const tenantResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  legalName: z.string(),
  status: z.string(),
  timezone: z.string(),
  currency: z.string(),
  settingsJson: z.unknown(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const branchResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  addressJson: z.unknown().nullable(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── User ──────────────────────────────────────────────────────────────────

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  role: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: z.string(),
  totpEnabled: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Property ──────────────────────────────────────────────────────────────

export const propertyResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  propertyCode: z.string(),
  type: z.string(),
  street: z.string(),
  addressLine2: z.string().nullable(),
  suburb: z.string(),
  postcode: z.string(),
  state: z.string(),
  country: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  geocodingStatus: z.string(),
  notes: z.string().nullable(),
  rulesJson: z.unknown(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Service Type ──────────────────────────────────────────────────────────

export const serviceTypeResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  flowType: z.string(),
  requiresTenantConfirmation: z.boolean(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Pricing Rule ──────────────────────────────────────────────────────────

export const pricingRuleResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  serviceTypeId: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  priceAmount: z.number(),
  payoutType: z.string(),
  payoutValue: z.number(),
  bonusRuleJson: z.unknown().nullable(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Inspector ─────────────────────────────────────────────────────────────

export const inspectorResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: z.string(),
  paymentSettingsJson: z.unknown(),
  regionsJson: z.unknown(),
  serviceTypesJson: z.unknown(),
  clientEligibilityJson: z.unknown(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const availabilitySlotResponseSchema = z.object({
  id: z.string().uuid(),
  inspectorId: z.string().uuid(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  regionJson: z.unknown().nullable(),
  capacity: z.number(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Appointment ───────────────────────────────────────────────────────────

export const appointmentResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  propertyId: z.string().uuid(),
  serviceTypeId: z.string().uuid(),
  inspectorId: z.string().uuid().nullable(),
  serviceGroupId: z.string().uuid().nullable(),
  status: z.string(),
  scheduledDate: z.string(),
  timeSlot: z.string(),
  keyRequired: z.boolean(),
  meetingLocation: z.string().nullable(),
  keyLocation: z.string().nullable(),
  tenantConfirmationStatus: z.string(),
  priceAmount: z.number(),
  payoutAmount: z.number(),
  pricingRuleSnapshotJson: z.unknown(),
  notes: z.string().nullable(),
  customFieldsJson: z.unknown().nullable(),
  reason: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  doneCheckedByUserId: z.string().uuid().nullable(),
  doneCheckedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contact: z.unknown().nullable().optional(),
  restrictions: z.array(z.unknown()).optional(),
  property: z.unknown().optional(),
  serviceType: z.unknown().optional(),
  inspector: z.unknown().nullable().optional(),
  branch: z.unknown().optional(),
});

// ─── Service Group ─────────────────────────────────────────────────────────

export const serviceGroupResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  serviceTypeId: z.string().uuid(),
  status: z.string(),
  groupSize: z.number(),
  offeredCount: z.number(),
  confirmedCount: z.number(),
  scheduledDate: z.string(),
  timeWindow: z.string(),
  priorityMode: z.string(),
  priorityExpiresAt: z.string().nullable(),
  assignedInspectorId: z.string().uuid().nullable(),
  publishedAt: z.string().nullable(),
  assignedAt: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  appointments: z.array(z.unknown()).optional(),
  assignedInspector: z.unknown().nullable().optional(),
});

// ─── Marketplace Offer ─────────────────────────────────────────────────────

export const marketplaceOfferResponseSchema = serviceGroupResponseSchema;

// ─── Audit Log ─────────────────────────────────────────────────────────────

export const auditLogResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  actorType: z.string(),
  actorId: z.string().nullable(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  action: z.string(),
  reason: z.string().nullable(),
  beforeJson: z.unknown().nullable(),
  afterJson: z.unknown().nullable(),
  requestId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  metadataJson: z.unknown().nullable(),
  createdAt: z.string(),
});

// ─── Tenant Portal ─────────────────────────────────────────────────────────

export const portalDataResponseSchema = z.object({
  appointment: z.unknown(),
  contact: z.unknown().nullable(),
  restrictions: z.array(z.unknown()),
});

export const portalTokenResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});

// ─── Inspector Execution ───────────────────────────────────────────────────

export const inspectorScheduleItemSchema = z.object({
  id: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  status: z.string(),
  scheduledDate: z.string(),
  timeSlot: z.string(),
  property: z.unknown(),
  serviceType: z.unknown(),
});

export const inspectionExecutionResponseSchema = z.object({
  id: z.string().uuid(),
  appointmentId: z.string().uuid(),
  inspectorId: z.string().uuid(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  startLatitude: z.number(),
  startLongitude: z.number(),
  finishLatitude: z.number().nullable(),
  finishLongitude: z.number().nullable(),
  checklistJson: z.unknown().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const inspectionAssetResponseSchema = z.object({
  id: z.string().uuid(),
  appointmentId: z.string().uuid(),
  inspectionExecutionId: z.string().uuid(),
  storageKey: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().nullable(),
  kind: z.string(),
  status: z.string(),
  uploadedBy: z.string(),
  uploadUrl: z.string().optional(),
  createdAt: z.string(),
});

// ─── Financial Entry ───────────────────────────────────────────────────────

export const financialEntryResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  appointmentId: z.string().uuid().nullable(),
  inspectorId: z.string().uuid().nullable(),
  entryType: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  description: z.string(),
  effectiveAt: z.string(),
  initiatedByUserId: z.string().uuid(),
  approvedByUserId: z.string().uuid().nullable(),
  approvedAt: z.string().nullable(),
  referenceEntryId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Invoice ───────────────────────────────────────────────────────────────

export const invoiceResponseSchema = z.object({
  id: z.string().uuid(),
  inspectorId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  periodType: z.string(),
  status: z.string(),
  totalAmount: z.number(),
  currency: z.string(),
  fileKey: z.string().nullable(),
  generatedByUserId: z.string().uuid().nullable(),
  generatedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const invoiceDownloadResponseSchema = z.object({
  downloadUrl: z.string(),
  expiresAt: z.string(),
});

// ─── Notification ──────────────────────────────────────────────────────────

export const notificationResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  appointmentId: z.string().uuid().nullable(),
  recipient: z.string(),
  channel: z.string(),
  templateCode: z.string(),
  status: z.string(),
  providerName: z.string().nullable(),
  providerMessageId: z.string().nullable(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  failureReason: z.string().nullable(),
  retryCount: z.number(),
  nextRetryAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const notificationTemplateResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  templateCode: z.string(),
  channel: z.string(),
  subject: z.string().nullable(),
  bodyHtml: z.string().nullable(),
  bodyText: z.string(),
  variablesJson: z.unknown(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Report ────────────────────────────────────────────────────────────────

export const reportResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  reportType: z.string(),
  filtersJson: z.unknown(),
  format: z.string(),
  status: z.string(),
  fileKey: z.string().nullable(),
  requestedByUserId: z.string().uuid(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  rowCount: z.number().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const reportDownloadResponseSchema = z.object({
  downloadUrl: z.string(),
  expiresAt: z.string(),
});

export const reportRequestedResponseSchema = z.object({
  data: z.object({
    reportId: z.string().uuid(),
    status: z.string(),
    reportType: z.string(),
    createdAt: z.string(),
  }),
  message: z.string(),
});

// ─── Webhook ───────────────────────────────────────────────────────────────

export const webhookAckResponseSchema = z.object({
  received: z.literal(true),
});

// ─── Type exports ──────────────────────────────────────────────────────────

export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type TenantResponse = z.infer<typeof tenantResponseSchema>;
export type BranchResponse = z.infer<typeof branchResponseSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type PropertyResponse = z.infer<typeof propertyResponseSchema>;
export type ServiceTypeResponse = z.infer<typeof serviceTypeResponseSchema>;
export type PricingRuleResponse = z.infer<typeof pricingRuleResponseSchema>;
export type InspectorResponse = z.infer<typeof inspectorResponseSchema>;
export type AvailabilitySlotResponse = z.infer<typeof availabilitySlotResponseSchema>;
export type AppointmentResponse = z.infer<typeof appointmentResponseSchema>;
export type ServiceGroupResponse = z.infer<typeof serviceGroupResponseSchema>;
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;
export type FinancialEntryResponse = z.infer<typeof financialEntryResponseSchema>;
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;
export type NotificationTemplateResponse = z.infer<typeof notificationTemplateResponseSchema>;
export type ReportResponse = z.infer<typeof reportResponseSchema>;
export type InspectionExecutionResponse = z.infer<typeof inspectionExecutionResponseSchema>;
export type InspectionAssetResponse = z.infer<typeof inspectionAssetResponseSchema>;
