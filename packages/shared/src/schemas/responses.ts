import { z } from 'zod';
import { propertyRulesSchema } from './property';
import { bonusRuleSchema } from './pricing-rule';

/** Accepts Date objects or ISO strings, coerces to string */
const dateStr = () => z.union([z.string(), z.date().transform(d => d.toISOString())]);
const dateStrNullable = () => dateStr().nullable();

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
  totpSetupRequired: z.boolean().optional(),
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
});

export const meResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  tenantId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  totpEnabled: z.boolean(),
  phone: z.string().nullable(),
  status: z.string(),
  lastLoginAt: dateStrNullable(),
  createdAt: dateStr(),
  inspectorId: z.string().uuid().nullable().optional(),
  inspectorPhotoUrl: z.string().nullable().optional(),
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
  branchCount: z.number().optional(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
});

export const branchResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  addressJson: z.unknown().nullable(),
  contactEmail: z.string().nullable(),
  status: z.string(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
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
  totpEnabled: z.boolean().optional(),
  lastLoginAt: dateStrNullable().optional(),
  createdAt: dateStr(),
  updatedAt: dateStr().optional(),
});

// ─── Property ──────────────────────────────────────────────────────────────

export const propertyResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  branchName: z.string().nullable().optional(),
  propertyCode: z.string(),
  type: z.string(),
  street: z.string(),
  addressLine2: z.string().nullable(),
  suburb: z.string(),
  postcode: z.string(),
  state: z.string(),
  country: z.string(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  geocodingStatus: z.string(),
  notes: z.string().nullable(),
  rulesJson: propertyRulesSchema.optional(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
});

// ─── Service Type ──────────────────────────────────────────────────────────

export const serviceTypeResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  flowType: z.string(),
  requiresTenantConfirmation: z.boolean(),
  status: z.string(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
});

// ─── Pricing Rule ──────────────────────────────────────────────────────────

export const pricingRuleResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  currency: z.string().length(3),
  serviceTypeId: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  priceAmount: z.number(),
  payoutType: z.string(),
  payoutValue: z.number(),
  bonusRuleJson: bonusRuleSchema.nullable(),
  status: z.string(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
});

// ─── Inspector ─────────────────────────────────────────────────────────────

export const inspectorResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: z.string(),
  paymentSettingsJson: z.unknown(),
  regionIds: z.array(z.string()).optional(),
  serviceTypesJson: z.unknown(),
  clientEligibilityJson: z.unknown(),
  // Profile + denylist fields (Feedback Round item 1, item 6).
  blockedClients: z.array(z.string()).optional(),
  fullName: z.string().nullable().optional(),
  address: z.unknown().optional(),
  abn: z.string().nullable().optional(),
  dateOfBirth: dateStrNullable().optional(),
  insuranceFileKey: z.string().nullable().optional(),
  insuranceExpiresAt: dateStrNullable().optional(),
  policeCheckFileKey: z.string().nullable().optional(),
  policeCheckExpiresAt: dateStrNullable().optional(),
  photoStorageKey: z.string().nullable().optional(),
  insuranceMetaJson: z.unknown().optional(),
  policeCheckMetaJson: z.unknown().optional(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
});

export const availabilitySlotResponseSchema = z.object({
  id: z.string().uuid(),
  inspectorId: z.string().uuid(),
  inspectorName: z.string().nullable().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  region: z.string().nullable().optional(),
  regionJson: z.unknown().nullable().optional(),
  capacity: z.number(),
  bookedCount: z.number().optional(),
  status: z.string(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
});

// ─── Appointment ───────────────────────────────────────────────────────────

export const appointmentResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  propertyId: z.string().uuid(),
  serviceTypeId: z.string().uuid(),
  inspectorId: z.string().uuid().nullable(),
  serviceGroupId: z.string().uuid().nullable().optional(),
  status: z.string(),
  scheduledDate: dateStr(),
  timeSlot: z.string(),
  keyRequired: z.boolean().optional(),
  meetingLocation: z.string().nullable().optional(),
  keyLocation: z.string().nullable().optional(),
  tenantConfirmationStatus: z.string(),
  priceAmount: z.number(),
  payoutAmount: z.number(),
  pricingRuleSnapshotJson: z.unknown().optional(),
  notes: z.string().nullable(),
  tenantNote: z.string().nullable().optional(),
  observation: z.string().nullable().optional(),
  hasTenantNote: z.boolean().optional(),
  hasActivePortalToken: z.boolean().default(false),
  customFieldsJson: z.unknown().nullable().optional(),
  reason: z.string().nullable().optional(),
  cancellationReasonCode: z.string().nullable().optional(),
  rejectionReasonCode: z.string().nullable().optional(),
  createdByUserId: z.string().uuid(),
  doneCheckedByUserId: z.string().uuid().nullable().optional(),
  doneCheckedAt: dateStrNullable().optional(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
  appointmentNumber: z.number().optional(),
  // Flat enriched fields for list and detail views
  code: z.string().optional(),
  propertyAddress: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  inspectorName: z.string().nullable().optional(),
  branchName: z.string().nullable().optional(),
  serviceTypeName: z.string().nullable().optional(),
  /** Tenant (agency) display name surfaced as "CLIENT" in the map detail panel (025 §FR-451). */
  clientName: z.string().optional(),
  cancellationReason: z.string().nullable().optional(),
  // Geographic coordinates propagated from the appointment's property (for map views)
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  contact: z.unknown().nullable().optional(),
  contacts: z.array(z.unknown()).optional(),
  restrictions: z.array(z.unknown()).optional(),
  property: z.unknown().optional(),
  serviceType: z.unknown().optional(),
  inspector: z.unknown().nullable().optional(),
  branch: z.unknown().optional(),
});

export const forceManualConfirmationResponseSchema = z.object({
  id: z.string().uuid(),
  tenantConfirmationStatus: z.string(),
});

export const inspectorAppointmentDetailResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  scheduledDate: z.string(),
  timeSlot: z.string(),
  timeSlotStart: z.string(),
  timeSlotEnd: z.string(),
  serviceTypeId: z.string().uuid(),
  serviceTypeName: z.string().nullable(),
  flowType: z.string(),
  propertyId: z.string().uuid(),
  propertyAddress: z.string(),
  suburb: z.string(),
  propertyLatitude: z.number().nullable(),
  propertyLongitude: z.number().nullable(),
  tenantConfirmationStatus: z.string(),
  tenantConfirmation: z.string(),
  keyRequired: z.boolean(),
  meetingLocation: z.string().nullable(),
  keyLocation: z.string().nullable(),
  tenantName: z.string(),
  tenantPhone: z.string().nullable(),
  tenantEmail: z.string().nullable(),
  notes: z.string().nullable(),
  observation: z.string().nullable(),
  restrictionsSummary: z.string().nullable(),
  contact: z.object({
    tenantName: z.string(),
    primaryEmail: z.string().nullable(),
    primaryPhone: z.string().nullable(),
    secondaryPhone: z.string().nullable(),
  }).nullable(),
  restrictions: z.array(z.object({
    isHome: z.boolean(),
    unavailableDaysJson: z.unknown(),
    unavailableHoursJson: z.unknown(),
    notes: z.string().nullable(),
  })),
  execution: z.object({
    id: z.string().uuid(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    startLatitude: z.number(),
    startLongitude: z.number(),
    finishLatitude: z.number().nullable(),
    finishLongitude: z.number().nullable(),
    geolocationDistanceMeters: z.number().nullable(),
    status: z.enum(['IN_PROGRESS', 'FINISHED']),
  }).nullable(),
  assets: z.array(z.object({
    id: z.string().uuid(),
    storageKey: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().nullable(),
    kind: z.string(),
    status: z.string(),
  })),
  agencyName: z.string().nullable().optional(),
  payoutAmount: z.number().nullable().optional(),
  inspectionAppLink: z.string().nullable().optional(),
  appointmentCode: z.string().optional(),
  jobDetails: z.object({
    agency: z.object({ id: z.string(), name: z.string() }),
    tenantContacts: z.array(z.object({
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      role: z.string(),
      isPrimary: z.boolean(),
    })),
    keys: z.object({
      keyRequired: z.boolean(),
      keyLocation: z.string().nullable(),
    }),
    keyLocation: z.object({
      address: z.string(),
      mapLinkUrl: z.string(),
    }).optional(),
    propertyManager: z.object({
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      company: z.string().nullable(),
    }).nullable(),
    payment: z.object({
      payoutAmount: z.number(),
      currency: z.string(),
    }),
    inspectionAppLink: z.object({
      url: z.string(),
      label: z.string(),
    }).optional(),
  }).nullable().optional(),
});

// ─── Service Group ─────────────────────────────────────────────────────────

// Single source of truth for the agency reference shape (cross-agency groups
// derive their agencies from the linked appointments' tenants).
export const agencyRefSchema = z.object({ id: z.string().uuid(), name: z.string() });
export type Agency = z.infer<typeof agencyRefSchema>;

export const serviceGroupResponseSchema = z.object({
  id: z.string().uuid(),
  // Null when the group spans multiple agencies (cross-agency group).
  tenantId: z.string().uuid().nullable(),
  // Distinct agencies of the group's appointments (one entry for single-agency groups).
  agencies: z.array(agencyRefSchema).optional(),
  serviceTypeId: z.string().uuid(),
  status: z.string(),
  groupSize: z.number(),
  offeredCount: z.number(),
  confirmedCount: z.number(),
  scheduledDate: dateStr(),
  timeWindow: z.string(),
  name: z.string().nullable().optional(),
  regionName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  priorityMode: z.string(),
  priorityExpiresAt: dateStrNullable(),
  assignedInspectorId: z.string().uuid().nullable(),
  serviceRegionId: z.string().uuid().nullable().optional(),
  publishedAt: dateStrNullable(),
  assignedAt: dateStrNullable().optional(),
  createdByUserId: z.string().uuid().optional(),
  createdAt: dateStr(),
  updatedAt: dateStr().optional(),
  appointmentsCount: z.number().optional(),
  appointments: z.array(z.unknown()).optional(),
  assignedInspector: z.unknown().nullable().optional(),
});

// ─── Marketplace Offer ─────────────────────────────────────────────────────

const centroidSchema = z.object({ lat: z.number(), lng: z.number() }).nullable();

export const marketplaceOfferResponseSchema = z.object({
  groupId: z.string().uuid(),
  tenantName: z.string(),
  serviceTypeName: z.string(),
  groupSize: z.number(),
  scheduledDate: dateStr(),
  timeWindow: z.string(),
  priorityMode: z.string(),
  priorityExpiresAt: dateStrNullable(),
  suburbs: z.array(z.string()),
  payoutEstimate: z.number().nullable(),
  appointmentCount: z.number(),
  centroid: centroidSchema,
});

export const marketplaceOfferDetailAppointmentSchema = z.object({
  id: z.string().uuid(),
  appointmentCode: z.string(),
  appointmentNumber: z.number(),
  suburb: z.string(),
  keyRequired: z.boolean(),
  notes: z.string().nullable(),
  payoutAmount: z.number().nullable(),
  // Agency (tenant) name of this appointment — shown per-job (groups may be cross-agency).
  tenantName: z.string(),
});

export const marketplaceOfferDetailResponseSchema = marketplaceOfferResponseSchema.extend({
  addresses: z.array(z.string()),
  keyRequired: z.boolean(),
  notes: z.string().nullable(),
  appointments: z.array(marketplaceOfferDetailAppointmentSchema),
});

export type MarketplaceOfferDetailAppointment = z.infer<typeof marketplaceOfferDetailAppointmentSchema>;
export type MarketplaceOfferDetail = z.infer<typeof marketplaceOfferDetailResponseSchema>;

export const marketplaceOfferAcceptResponseSchema = z.object({
  groupId: z.string().uuid(),
  status: z.string(),
  assignedInspectorId: z.string().uuid(),
  appointmentsScheduled: z.number(),
  acceptedAt: dateStr(),
});

// ─── Audit Log ─────────────────────────────────────────────────────────────

export const auditLogResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  tenantName: z.string().nullable().optional(),
  actorType: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  action: z.string(),
  reason: z.string().nullable(),
  beforeJson: z.unknown().nullable(),
  afterJson: z.unknown().nullable(),
  requestId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  metadataJson: z.unknown().nullable(),
  createdAt: dateStr(),
  // Feature 020: retention + redaction + cold-storage lifecycle markers
  retentionCategory: z
    .enum(['FINANCIAL', 'OPERATIONAL_CRITICAL', 'OPERATIONAL_GENERAL'])
    .nullable()
    .optional(),
  redactionStatus: z.enum(['NONE', 'PARTIAL', 'FULL', 'IN_PROGRESS']).optional(),
  isArchived: z.boolean().optional(),
});

// ─── Tenant Portal ─────────────────────────────────────────────────────────

export const portalDataResponseSchema = z.object({
  token: z.object({
    status: z.string(),
    isReadOnly: z.boolean(),
    isExpired: z.boolean(),
    canRequestNewLink: z.boolean(),
    expiresAt: dateStr(),
  }),
  appointment: z.unknown(),
  contact: z.unknown().nullable(),
  restrictions: z.unknown().nullable(),
  existingResponse: z.object({
    type: z.string(),
    createdAt: dateStr(),
    summary: z.string().optional(),
  }).optional(),
  agencyPhone: z.string().optional(),
  deadline: dateStr().optional(),
  rescheduleAllowed: z.boolean().optional(),
  tenant: z.object({ name: z.string().nullable(), timezone: z.string() }).optional(),
});

/**
 * Response shape of `POST /v1/appointments/:appointmentId/portal-token`.
 *
 * 023 §FR-221 / BUG-023-001 — when the appointment has no primary contact,
 * the use case still mints the token (auditable as a privileged action) but
 * skips the notification dispatch and returns `dispatched: false` plus
 * `reason: 'NO_PRIMARY_CONTACT'`. Without these fields in the schema,
 * Fastify's whitelist serialiser silently strips them and API consumers
 * cannot distinguish SUCCESS from a primary-less skip.
 */
export const portalTokenResponseSchema = z.object({
  token: z.string(),
  expiresAt: dateStr(),
  dispatched: z.boolean().optional(),
  reason: z.literal('NO_PRIMARY_CONTACT').optional(),
});

export const portalActivityItemSchema = z.object({
  id: z.string().uuid(),
  appointmentId: z.string().uuid(),
  tenantPortalTokenId: z.string().uuid(),
  action: z.string(),
  previousValuesJson: z.unknown().nullable(),
  newValuesJson: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: dateStr(),
});

export const portalActivitiesResponseSchema = z.object({
  data: z.array(portalActivityItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

// ─── Inspector Execution ───────────────────────────────────────────────────

export const inspectorScheduleItemSchema = z.object({
  id: z.string(),
  appointmentCode: z.string().optional(),
  status: z.string(),
  scheduledDate: dateStr(),
  timeSlot: z.string(),
  serviceTypeId: z.string().uuid(),
  propertyId: z.string().uuid(),
  tenantConfirmationStatus: z.string(),
  keyRequired: z.boolean(),
  meetingLocation: z.string().nullable(),
  executionStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'FINISHED']),
  agencyName: z.string().nullable().optional(),
});

export const inspectorScheduleResponseSchema = z.object({
  date: dateStr(),
  appointments: z.array(inspectorScheduleItemSchema),
});

export const inspectionExecutionResponseSchema = z.object({
  id: z.string().uuid(),
  appointmentId: z.string().uuid(),
  inspectorId: z.string().uuid(),
  startedAt: dateStr(),
  finishedAt: dateStrNullable(),
  resumedAt: dateStrNullable(),
  startLatitude: z.number(),
  startLongitude: z.number(),
  finishLatitude: z.number().nullable(),
  finishLongitude: z.number().nullable(),
  geolocationDistanceMeters: z.number().nullable(),
  checklistJson: z.unknown().nullable(),
  notes: z.string().nullable(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
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
  createdAt: dateStr(),
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
  effectiveAt: dateStr(),
  initiatedByUserId: z.string().uuid(),
  approvedByUserId: z.string().uuid().nullable(),
  approvedAt: dateStrNullable(),
  referenceEntryId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  createdAt: dateStr(),
  updatedAt: dateStr().optional(),
  // Enriched fields (name-resolved for UI display)
  appointmentCode: z.string().nullable().optional(),
  relatedEntityName: z.string().nullable().optional(),
  approvedByName: z.string().nullable().optional(),
});

// ─── Invoice ───────────────────────────────────────────────────────────────

export const invoiceResponseSchema = z.object({
  id: z.string().uuid(),
  inspectorId: z.string().uuid(),
  inspectorName: z.string().nullable().optional(),
  periodStart: dateStr(),
  periodEnd: dateStr(),
  periodType: z.string(),
  status: z.string(),
  totalAmount: z.number(),
  currency: z.string(),
  fileKey: z.string().nullable().optional(),
  generatedByUserId: z.string().uuid().nullable().optional(),
  generatedAt: dateStrNullable(),
  paidAt: dateStrNullable(),
  // Payment reconciliation fields (feature 017) — populated when invoice transitions to PAID
  paidByUserId: z.string().uuid().nullable().optional(),
  paymentReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: dateStr(),
  updatedAt: dateStr().optional(),
});

export const invoiceDownloadResponseSchema = z.object({
  downloadUrl: z.string(),
  expiresAt: dateStr(),
});

// ─── Tenant Invoice ───────────────────────────────────────────────────────

export const tenantInvoiceResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  periodFrom: dateStr(),
  periodTo: dateStr(),
  totalDebit: z.number(),
  totalRefund: z.number(),
  totalAdjustment: z.number(),
  netAmount: z.number(),
  currency: z.string(),
  status: z.string(),
  fileKey: z.string().nullable().optional(),
  previousInvoiceId: z.string().uuid().nullable().optional(),
  generatedByUserId: z.string().uuid().nullable().optional(),
  generatedAt: dateStrNullable(),
  notes: z.string().nullable().optional(),
  createdAt: dateStr(),
  updatedAt: dateStr().optional(),
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
  // Feature 018: classification propagated from template at create time
  notificationClass: z.enum(['TRANSACTIONAL', 'OPERATIONAL', 'MARKETING']).nullable().optional(),
  providerName: z.string().nullable(),
  providerMessageId: z.string().nullable().optional(),
  sentAt: dateStrNullable(),
  deliveredAt: dateStrNullable(),
  failedAt: dateStrNullable(),
  failureReason: z.string().nullable(),
  retryCount: z.number(),
  nextRetryAt: dateStrNullable().optional(),
  createdAt: dateStr(),
  updatedAt: dateStr().optional(),
});

export const notificationTemplateResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  templateCode: z.string(),
  channel: z.string(),
  subject: z.string().nullable(),
  bodyHtml: z.string().nullable().optional(),
  bodyText: z.string(),
  variablesJson: z.unknown().optional(),
  variables: z.unknown().optional(),
  isActive: z.boolean(),
  // Feature 018: declared classification
  notificationClass: z.enum(['TRANSACTIONAL', 'OPERATIONAL', 'MARKETING']).optional(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
});

// ─── Report ────────────────────────────────────────────────────────────────

export const reportResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable().optional(),
  reportType: z.string(),
  filtersJson: z.unknown().optional(),
  filters: z.unknown().optional(),
  format: z.string(),
  status: z.string(),
  fileKey: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  requestedByUserId: z.string().uuid().optional(),
  requestedBy: z.unknown().optional(),
  startedAt: dateStrNullable().optional(),
  completedAt: dateStrNullable(),
  failedAt: dateStrNullable().optional(),
  errorMessage: z.string().nullable().optional(),
  rowCount: z.number().nullable().optional(),
  expiresAt: dateStrNullable().optional(),
  createdAt: dateStr(),
  updatedAt: dateStr().optional(),
});

export const reportDownloadResponseSchema = z.object({
  downloadUrl: z.string(),
  expiresAt: dateStr(),
});

export const reportRequestedResponseSchema = z.object({
  data: z.object({
    reportId: z.string().uuid(),
    status: z.string(),
    reportType: z.string(),
    createdAt: dateStr(),
  }),
  message: z.string(),
});

export const scheduledReportResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  reportType: z.string(),
  filtersJson: z.unknown().optional(),
  format: z.string(),
  cronExpression: z.string(),
  deliveryEmail: z.string(),
  isActive: z.boolean(),
  lastRunAt: dateStrNullable().optional(),
  nextRunAt: dateStrNullable().optional(),
  createdByUserId: z.string().uuid().optional(),
  createdAt: dateStr(),
  updatedAt: dateStr(),
  // Feature 019: lifecycle extensions
  displayName: z.string().nullable().optional(),
  deliveryMode: z.enum(['OWNER_ONLY', 'RECIPIENT_LIST', 'TENANT_WIDE']).optional(),
  recipientUserIds: z.array(z.string().uuid()).optional(),
  skipDeliveryWhenEmpty: z.boolean().optional(),
  consecutiveFailureCount: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  deletedAt: dateStrNullable().optional(),
  lastRunStatus: z
    .enum(['queued', 'running', 'completed', 'failed', 'skipped_catchup', 'skipped_empty'])
    .nullable()
    .optional(),
});

export const scheduledReportCreatedResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    reportType: z.string(),
    cronExpression: z.string(),
    deliveryEmail: z.string(),
    isActive: z.boolean(),
    nextRunAt: dateStrNullable().optional(),
    createdAt: dateStr(),
  }),
  message: z.string(),
});

export type ScheduledReportResponse = z.infer<typeof scheduledReportResponseSchema>;

// ─── Dashboard ────────────────────────────────────────────────────────────

export const inspectorDayCountSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  count: z.number().int().nonnegative(),
  alertLevel: z.enum(['yellow', 'red']).nullable(),
});

export const inspectorBreakdownsSchema = z.object({
  tomorrowByInspector: z.array(inspectorDayCountSchema),
  scheduledThisWeekByInspector: z.array(inspectorDayCountSchema),
  confirmedThisWeekByInspector: z.array(inspectorDayCountSchema),
});

export const dashboardStatsResponseSchema = z.object({
  appointmentsByStatus: z.object({
    draft: z.number(),
    awaitingInspector: z.number(),
    scheduled: z.number(),
    doneThisMonth: z.number(),
    doneThisWeek: z.number(),
    scheduledThisWeek: z.number(),
    rejectedTotal: z.number(),
  }),
  recentAppointments: z.array(z.object({
    id: z.string().uuid(),
    code: z.string(),
    propertyAddress: z.string(),
    status: z.string(),
    doneMarkedByUserId: z.string().uuid().nullable().optional(),
    doneCheckedByUserId: z.string().uuid().nullable().optional(),
    scheduledDate: dateStr(),
  })),
  pendingActions: z.object({
    noResponseTenants: z.number(),
    pendingOperatorCrossChecks: z.number(),
    pendingFinancialEntries: z.number(),
    processingReports: z.number(),
  }),
  quickStats: z.object({
    totalProperties: z.number(),
    activeInspectors: z.number(),
    activeServiceGroups: z.number(),
  }),
  inspectorBreakdowns: inspectorBreakdownsSchema.nullable(),
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
export type DashboardStatsResponse = z.infer<typeof dashboardStatsResponseSchema>;
export type InspectorDayCount = z.infer<typeof inspectorDayCountSchema>;
export type InspectorBreakdowns = z.infer<typeof inspectorBreakdownsSchema>;
export type TenantInvoiceResponse = z.infer<typeof tenantInvoiceResponseSchema>;
