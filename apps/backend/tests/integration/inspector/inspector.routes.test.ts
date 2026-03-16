import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';

// Module-level mock functions for inspector use cases
const mockCreateInspectorExecute = vi.fn();
const mockGetInspectorExecute = vi.fn();
const mockListInspectorsExecute = vi.fn();
const mockUpdateInspectorExecute = vi.fn();
const mockCreateAvailabilitySlotExecute = vi.fn();
const mockListAvailabilitySlotsExecute = vi.fn();
const mockUpdateAvailabilitySlotExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => ({
    prisma: {},
    auditService: { log: mockAuditLog },
    auth: {
      loginUseCase: { execute: vi.fn() },
      refreshTokenUseCase: { execute: vi.fn() },
      logoutUseCase: { execute: vi.fn() },
      getMeUseCase: { execute: vi.fn() },
      changePasswordUseCase: { execute: vi.fn() },
      revokeSessionUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    tenant: {
      createTenantUseCase: { execute: vi.fn() },
      getTenantUseCase: { execute: vi.fn() },
      listTenantsUseCase: { execute: vi.fn() },
      updateTenantUseCase: { execute: vi.fn() },
      deactivateTenantUseCase: { execute: vi.fn() },
      createBranchUseCase: { execute: vi.fn() },
      listBranchesUseCase: { execute: vi.fn() },
      updateBranchUseCase: { execute: vi.fn() },
      deactivateBranchUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    user: {
      createUserUseCase: { execute: vi.fn() },
      getUserUseCase: { execute: vi.fn() },
      listUsersUseCase: { execute: vi.fn() },
      updateUserUseCase: { execute: vi.fn() },
      deactivateUserUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    property: {
      createPropertyUseCase: { execute: vi.fn() },
      getPropertyUseCase: { execute: vi.fn() },
      listPropertiesUseCase: { execute: vi.fn() },
      updatePropertyUseCase: { execute: vi.fn() },
      deletePropertyUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    serviceType: {
      createServiceTypeUseCase: { execute: vi.fn() },
      getServiceTypeUseCase: { execute: vi.fn() },
      listServiceTypesUseCase: { execute: vi.fn() },
      updateServiceTypeUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    pricingRule: {
      createPricingRuleUseCase: { execute: vi.fn() },
      listPricingRulesUseCase: { execute: vi.fn() },
      updatePricingRuleUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    inspector: {
      createInspectorUseCase: { execute: mockCreateInspectorExecute },
      getInspectorUseCase: { execute: mockGetInspectorExecute },
      listInspectorsUseCase: { execute: mockListInspectorsExecute },
      updateInspectorUseCase: { execute: mockUpdateInspectorExecute },
      createAvailabilitySlotUseCase: { execute: mockCreateAvailabilitySlotExecute },
      listAvailabilitySlotsUseCase: { execute: mockListAvailabilitySlotsExecute },
      updateAvailabilitySlotUseCase: { execute: mockUpdateAvailabilitySlotExecute },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    appointment: {
      createAppointmentUseCase: { execute: vi.fn() },
      getAppointmentUseCase: { execute: vi.fn() },
      listAppointmentsUseCase: { execute: vi.fn() },
      updateAppointmentUseCase: { execute: vi.fn() },
      executeStatusTransitionUseCase: { execute: vi.fn() },
      forceManualConfirmationUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
  }),
}));

const INSPECTOR_ID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';
const SLOT_ID = 'a6eebc99-9c0b-4ef8-bb6d-6bb9bd380a77';

const amContext = {
  userId: 'admin-1',
  tenantId: null,
  role: 'AM',
  branchId: null,
};

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- Inspector CRUD ----

describe('POST /v1/inspectors', () => {
  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreateInspectorExecute.mockResolvedValueOnce({
      id: INSPECTOR_ID,
      name: 'John Inspector',
      email: 'john@inspect.com',
      phone: null,
      status: 'ACTIVE',
      paymentSettingsJson: {},
      regionsJson: [],
      serviceTypesJson: [],
      clientEligibilityJson: [],
      createdAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'John Inspector',
        email: 'john@inspect.com',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('John Inspector');
  });

  it('should return 422 with invalid payload (missing email)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'John Inspector' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /v1/inspectors', () => {
  it('should return 200 with paginated response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListInspectorsExecute.mockResolvedValueOnce({
      data: [
        {
          id: INSPECTOR_ID,
          name: 'John Inspector',
          email: 'john@inspect.com',
          phone: null,
          status: 'ACTIVE',
          regionsJson: [],
          serviceTypesJson: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/inspectors')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /v1/inspectors/:inspectorId', () => {
  it('should return 200 with valid inspector', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetInspectorExecute.mockResolvedValueOnce({
      id: INSPECTOR_ID,
      name: 'John Inspector',
      email: 'john@inspect.com',
      phone: null,
      status: 'ACTIVE',
      paymentSettingsJson: {},
      regionsJson: [],
      serviceTypesJson: [],
      clientEligibilityJson: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(INSPECTOR_ID);
  });
});

describe('PATCH /v1/inspectors/:inspectorId', () => {
  it('should return 200 on successful update', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateInspectorExecute.mockResolvedValueOnce({
      id: INSPECTOR_ID,
      name: 'Updated Inspector',
      email: 'john@inspect.com',
      phone: '+61400000000',
      status: 'ACTIVE',
      paymentSettingsJson: {},
      regionsJson: [],
      serviceTypesJson: [],
      clientEligibilityJson: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .patch(`/v1/inspectors/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Updated Inspector', phone: '+61400000000' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Inspector');
  });
});

// ---- Availability Slots ----

describe('POST /v1/inspectors/:inspectorId/availability-slots', () => {
  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreateAvailabilitySlotExecute.mockResolvedValueOnce({
      id: SLOT_ID,
      inspectorId: INSPECTOR_ID,
      date: '2026-04-01',
      startTime: '09:00',
      endTime: '12:00',
      regionJson: null,
      capacity: 1,
      status: 'AVAILABLE',
      createdAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/availability-slots`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        date: '2026-04-01',
        startTime: '09:00',
        endTime: '12:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.startTime).toBe('09:00');
  });
});

describe('GET /v1/inspectors/:inspectorId/availability-slots', () => {
  it('should return 200 with paginated response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListAvailabilitySlotsExecute.mockResolvedValueOnce({
      data: [
        {
          id: SLOT_ID,
          inspectorId: INSPECTOR_ID,
          date: '2026-04-01',
          startTime: '09:00',
          endTime: '12:00',
          regionJson: null,
          capacity: 1,
          status: 'AVAILABLE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}/availability-slots`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data).toHaveLength(1);
  });
});

describe('PATCH /v1/inspectors/:inspectorId/availability-slots/:slotId', () => {
  it('should return 200 on successful update', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateAvailabilitySlotExecute.mockResolvedValueOnce({
      id: SLOT_ID,
      inspectorId: INSPECTOR_ID,
      date: '2026-04-01',
      startTime: '09:00',
      endTime: '14:00',
      regionJson: null,
      capacity: 2,
      status: 'AVAILABLE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .patch(`/v1/inspectors/${INSPECTOR_ID}/availability-slots/${SLOT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ endTime: '14:00', capacity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.endTime).toBe('14:00');
    expect(res.body.data.capacity).toBe(2);
  });
});
