import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';

/**
 * HTTP integration test for GET /v1/appointments/:appointmentId
 *
 * Covers TC-8 from contracts/appointment-response.contract.md:
 * `hasActivePortalToken` MUST be present in the JSON payload as a boolean
 * (never undefined) in every successful response.
 *
 * This is the contract guard for Bug 2 (AC-2.1, AC-2.2, AC-2.3).
 * After T023 tightens the schema from z.boolean().optional() → z.boolean(),
 * Fastify's response validation will enforce this at the serialisation layer.
 * Before T023, this test documents the expected contract.
 */

const APPT_ID = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_ID = 'bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb';

const mockGetAppointmentExecute = vi.fn();
const mockBulkCrossCheckDoneExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../../main/container', () => ({
  createContainer: () => ({
    prisma: {},
    auditService: { log: vi.fn() },
    auth: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    appointment: {
      getAppointmentUseCase: { execute: mockGetAppointmentExecute },
      createAppointmentUseCase: { execute: vi.fn() },
      listAppointmentsUseCase: { execute: vi.fn() },
      updateAppointmentUseCase: { execute: vi.fn() },
      executeStatusTransitionUseCase: { execute: vi.fn() },
      performCrossCheckUseCase: { execute: vi.fn() },
      forceManualConfirmationUseCase: { execute: vi.fn() },
      importAppointmentsUseCase: { execute: vi.fn() },
      getImportStatusUseCase: { execute: vi.fn() },
      deleteAppointmentUseCase: { execute: vi.fn() },
      bulkEditAppointmentsUseCase: { execute: vi.fn() },
      bulkCrossCheckDoneUseCase: { execute: mockBulkCrossCheckDoneExecute },
      bulkResendReminderUseCase: { execute: vi.fn() },
      bulkCancelAppointmentsUseCase: { execute: vi.fn() },
      bulkRescheduleAppointmentsUseCase: { execute: vi.fn() },
      bulkStatusTransitionUseCase: { execute: vi.fn() },
      bulkAssignInspectorUseCase: { execute: vi.fn() },
      bulkReopenForRescheduleUseCase: { execute: vi.fn() },
      reopenForRescheduleUseCase: { execute: vi.fn() },
      appointmentRepo: { findContactById: vi.fn() },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
    tenant: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    user: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    property: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    serviceType: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    pricingRule: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    inspector: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) }, slotRepo: { findByIdAny: vi.fn() } },
    audit: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    serviceGroup: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    marketplace: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    rentalTenantPortal: {
      getPortalDataUseCase: { execute: vi.fn() },
      confirmAppointmentUseCase: { execute: vi.fn() },
      rescheduleRequestUseCase: { execute: vi.fn() },
      updateContactUseCase: { execute: vi.fn() },
      reportUnavailabilityUseCase: { execute: vi.fn() },
      generatePortalTokenUseCase: { execute: vi.fn() },
      listPortalActivitiesUseCase: { execute: vi.fn() },
      getAvailableGroupsUseCase: { execute: vi.fn() },
      joinGroupUseCase: { execute: vi.fn() },
      tokenRepo: { findByTokenHash: vi.fn(), findActiveByAppointmentId: vi.fn(), save: vi.fn(), revokeAndSave: vi.fn(), updateStatus: vi.fn(), updateLastAccessedAt: vi.fn(), revokeAllForAppointment: vi.fn() },
      tokenService: { generateRawToken: vi.fn(), hashToken: vi.fn() },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) },
    },
    inspectorExecution: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    billing: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    report: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    notification: {
      sendNotificationUseCase: { execute: vi.fn() },
      retryNotificationUseCase: { execute: vi.fn() },
      handleProviderWebhookUseCase: { execute: vi.fn() },
      listNotificationsUseCase: { execute: vi.fn() },
      getNotificationUseCase: { execute: vi.fn() },
      upsertNotificationTemplateUseCase: { execute: vi.fn() },
      listNotificationTemplatesUseCase: { execute: vi.fn() },
      createNotificationUseCase: { execute: vi.fn() },
      pollRetryableNotificationsUseCase: { execute: vi.fn() },
      dispatchRemindersUseCase: { execute: vi.fn() },
      dispatchEscalationsUseCase: { execute: vi.fn() },
      listConsentsByRecipientUseCase: { execute: vi.fn() },
      overrideConsentUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) },
      webhookSignatureValidator: { validateResend: vi.fn().mockReturnValue(true) },
      getMobileMessageWebhookToken: undefined,
    },
    dashboard: { getDashboardStatsUseCase: { execute: vi.fn() }, jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    appointmentTimeSlot: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    serviceRegion: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    contact: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) } },
    cleanupSessionsWorker: { execute: vi.fn() },
    expireFilesWorker: { execute: vi.fn() },
    geocodeWorker: { execute: vi.fn() },
    appointmentImportWorker: { execute: vi.fn() },
    generateInvoiceFileWorker: { execute: vi.fn() },
    expireTokensWorker: { execute: vi.fn() },
    notifyStuckInspectionsWorker: { execute: vi.fn() },
    geocodeRetryWorker: { execute: vi.fn() },
    keyExpiryCheckWorker: { execute: vi.fn() },
    auditRetentionWorker: { execute: vi.fn() },
  }),
}));

/** Minimal valid appointment output (all required schema fields). */
function makeAppointmentOutput(hasActivePortalToken: boolean) {
  return {
    id: APPT_ID,
    appointmentNumber: 1,
    tenantId: TENANT_ID,
    branchId: 'cccccccc-0000-4000-8000-cccccccccccc',
    propertyId: 'dddddddd-0000-4000-8000-dddddddddddd',
    serviceTypeId: 'eeeeeeee-0000-4000-8000-eeeeeeeeeeee',
    inspectorId: null,
    serviceGroupId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-06-01T00:00:00.000Z'),
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    rentalTenantNote: null,
    hasRentalTenantNote: false,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'ffffffff-0000-4000-8000-ffffffffffff',
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    appointmentCode: 'INS-0001',
    code: 'PROP-001',
    propertyAddress: '1 Test St, Sydney NSW 2000',
    propertySuburb: 'Sydney',
    contactName: 'Test Tenant',
    contactPhone: null,
    contactEmail: null,
    inspectorName: null,
    branchName: 'Test Branch',
    tenantName: 'Test Agency',
    activeConfirmationCycleId: null,
    contact: null,
    contacts: [],
    restrictions: [],
    hasActivePortalToken,
  };
}

const opActor = {
  userId: 'aaaaaaaa-1111-4000-8000-aaaaaaaaaaaa',
  tenantId: null,
  role: 'OP',
  branchId: null,
  inspectorId: null,
};

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  const { buildApp } = await import('../../../../main/server');
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => {
  vi.clearAllMocks();
  mockJwtVerify.mockResolvedValue(opActor);
});

describe('GET /v1/appointments/:appointmentId — hasActivePortalToken field contract (TC-8)', () => {
  it('should include hasActivePortalToken:true as a boolean (not undefined) when token is active', async () => {
    mockGetAppointmentExecute.mockResolvedValue(makeAppointmentOutput(true));

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('hasActivePortalToken');
    expect(typeof res.body.data.hasActivePortalToken).toBe('boolean');
    expect(res.body.data.hasActivePortalToken).toBe(true);
  });

  it('should include hasActivePortalToken:false as a boolean (not undefined) when no active token', async () => {
    mockGetAppointmentExecute.mockResolvedValue(makeAppointmentOutput(false));

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('hasActivePortalToken');
    expect(typeof res.body.data.hasActivePortalToken).toBe('boolean');
    expect(res.body.data.hasActivePortalToken).toBe(false);
  });
});

describe('POST /v1/appointments/bulk-cross-check-done', () => {
  const ID_A = 'aaaaaaaa-2222-4000-8000-aaaaaaaaaaaa';
  const ID_B = 'bbbbbbbb-2222-4000-8000-bbbbbbbbbbbb';

  it('returns 200 with the {updated, failed} envelope for AM/OP', async () => {
    mockBulkCrossCheckDoneExecute.mockResolvedValue({
      updated: 1,
      failed: [{ id: ID_B, code: 'APPOINTMENT_DONE_CROSS_CHECK_INVALID_STATUS', message: 'not DONE' }],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-cross-check-done')
      .set('Authorization', 'Bearer token')
      .send({ ids: [ID_A, ID_B] });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);
    expect(res.body.data.failed).toHaveLength(1);
    expect(res.body.data.failed[0].code).toBe('APPOINTMENT_DONE_CROSS_CHECK_INVALID_STATUS');
    expect(mockBulkCrossCheckDoneExecute).toHaveBeenCalledWith(
      expect.objectContaining({ ids: [ID_A, ID_B] }),
    );
  });

  it('returns 403 for non-AM/OP actors and never invokes the use case', async () => {
    mockJwtVerify.mockResolvedValue({ ...opActor, role: 'CL_ADMIN', tenantId: TENANT_ID });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-cross-check-done')
      .set('Authorization', 'Bearer token')
      .send({ ids: [ID_A] });

    expect(res.status).toBe(403);
    expect(mockBulkCrossCheckDoneExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when ids is empty', async () => {
    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-cross-check-done')
      .set('Authorization', 'Bearer token')
      .send({ ids: [] });

    expect(res.status).toBe(400);
    expect(mockBulkCrossCheckDoneExecute).not.toHaveBeenCalled();
  });
});
