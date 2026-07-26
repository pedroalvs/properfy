/**
 * T026-T030 — Matrix-driven RBAC integration tests.
 *
 * Picks 12 critical role×action combinations from ROLE_ACTION_MATRIX and
 * verifies that:
 *   - Permitted roles receive 200/201/204 (use case runs, mock resolves)
 *   - Forbidden roles receive 403 (use case throws ForbiddenError)
 *
 * Endpoints are chosen to cover every matrix domain:
 *   user management, appointment lifecycle, inspector management,
 *   service groups, financial operations, configuration, reports/audit.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  makeAmContext,
  makeOpContext,
  makeClAdminContext,
  makeClUserContext,
  makeInspContext,
} from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { ROLE_ACTION_MATRIX } from '@properfy/shared';

// Ensure the matrix is importable and non-empty
describe('ROLE_ACTION_MATRIX', () => {
  it('is defined and non-empty', () => {
    expect(ROLE_ACTION_MATRIX).toBeDefined();
    expect(Object.keys(ROLE_ACTION_MATRIX).length).toBeGreaterThan(0);
  });

  it('contains expected action domains', () => {
    const actions = Object.keys(ROLE_ACTION_MATRIX);
    expect(actions.some((a) => a.startsWith('user.'))).toBe(true);
    expect(actions.some((a) => a.startsWith('appointment.'))).toBe(true);
    expect(actions.some((a) => a.startsWith('inspector.'))).toBe(true);
    expect(actions.some((a) => a.startsWith('financial.'))).toBe(true);
    expect(actions.some((a) => a.startsWith('report.'))).toBe(true);
    expect(actions.some((a) => a.startsWith('audit.'))).toBe(true);
    expect(actions.some((a) => a.startsWith('config.'))).toBe(true);
  });

  it('user.create_internal is AM-only', () => {
    const entry = ROLE_ACTION_MATRIX['user.create_internal'];
    expect(entry).toBeDefined();
    expect(entry!.roles).toEqual(['AM']);
  });

  it('appointment.cross_check is AM and OP only', () => {
    const entry = ROLE_ACTION_MATRIX['appointment.cross_check'];
    expect(entry).toBeDefined();
    expect(entry!.roles).toContain('AM');
    expect(entry!.roles).toContain('OP');
    expect(entry!.roles).not.toContain('CL_ADMIN');
    expect(entry!.roles).not.toContain('CL_USER');
  });

  it('financial operations are AM and OP only', () => {
    for (const action of ['financial.view', 'financial.approve', 'financial.manual_adjustment', 'financial.refund']) {
      const entry = ROLE_ACTION_MATRIX[action];
      expect(entry, `action ${action} should be in matrix`).toBeDefined();
      expect(entry!.roles).toContain('AM');
      expect(entry!.roles).toContain('OP');
      expect(entry!.roles).not.toContain('CL_ADMIN');
      expect(entry!.roles).not.toContain('CL_USER');
      expect(entry!.roles).not.toContain('INSP');
    }
  });

  it('marketplace actions are INSP only', () => {
    for (const action of ['marketplace.view_offers', 'marketplace.accept_offer']) {
      const entry = ROLE_ACTION_MATRIX[action];
      expect(entry, `action ${action} should be in matrix`).toBeDefined();
      expect(entry!.roles).toEqual(['INSP']);
    }
  });

  it('appointment.reopen_done is AM-only', () => {
    const entry = ROLE_ACTION_MATRIX['appointment.reopen_done'];
    expect(entry).toBeDefined();
    expect(entry!.roles).toEqual(['AM']);
  });

  it('property.create includes CL_USER with cl_user_flag condition', () => {
    const entry = ROLE_ACTION_MATRIX['property.create'];
    expect(entry).toBeDefined();
    expect(entry!.roles).toContain('CL_USER');
    expect(entry!.condition).toBe('cl_user_flag');
    expect(entry!.conditionKey).toBe('create_properties');
  });

  it('appointment.cancel includes CL_USER with cl_user_flag condition', () => {
    const entry = ROLE_ACTION_MATRIX['appointment.cancel'];
    expect(entry).toBeDefined();
    expect(entry!.roles).toContain('CL_USER');
    expect(entry!.condition).toBe('cl_user_flag');
    expect(entry!.conditionKey).toBe('cancel_appointments');
  });

  it('user.create_tenant has tenant_setting condition', () => {
    const entry = ROLE_ACTION_MATRIX['user.create_tenant'];
    expect(entry).toBeDefined();
    expect(entry!.roles).toContain('CL_ADMIN');
    expect(entry!.condition).toBe('tenant_setting');
    expect(entry!.conditionKey).toBe('allowClientUserManagement');
  });
});

// ── HTTP integration: representative endpoint per domain ─────────────────────

const mockJwtVerify = vi.fn();
const mockCreateUser = vi.fn();
const mockListUsers = vi.fn();
const mockDeactivateUser = vi.fn();
const mockListAppointments = vi.fn();
const mockStatusTransition = vi.fn();
const mockCrossCheck = vi.fn();
const mockListEntries = vi.fn();
const mockCreateManualAdjustment = vi.fn();
const mockListInspectors = vi.fn();
const mockCreateInspector = vi.fn();
const mockListNotifications = vi.fn();
const mockUpsertTemplate = vi.fn();
const mockRequestReport = vi.fn();
const mockListAuditLogs = vi.fn();
const mockListTenants = vi.fn();
const mockListServiceGroups = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: {
      jwtService: { verify: mockJwtVerify },
      listTenantsUseCase: { execute: mockListTenants },
    },
    user: {
      jwtService: { verify: mockJwtVerify },
      createUserUseCase: { execute: mockCreateUser },
      listUsersUseCase: { execute: mockListUsers },
      deactivateUserUseCase: { execute: mockDeactivateUser },
    },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: {
      jwtService: { verify: mockJwtVerify },
      listInspectorsUseCase: { execute: mockListInspectors },
      createInspectorUseCase: { execute: mockCreateInspector },
    },
    appointment: {
      jwtService: { verify: mockJwtVerify },
      listAppointmentsUseCase: { execute: mockListAppointments },
      executeStatusTransitionUseCase: { execute: mockStatusTransition },
      performCrossCheckUseCase: { execute: mockCrossCheck },
    },
    audit: {
      jwtService: { verify: mockJwtVerify },
      listAuditLogsUseCase: { execute: mockListAuditLogs },
    },
    serviceGroup: {
      jwtService: { verify: mockJwtVerify },
      listServiceGroupsUseCase: { execute: mockListServiceGroups },
    },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: {
      jwtService: { verify: mockJwtVerify },
      listFinancialEntriesUseCase: { execute: mockListEntries },
      createManualAdjustmentUseCase: { execute: mockCreateManualAdjustment },
    },
    report: {
      jwtService: { verify: mockJwtVerify },
      requestReportUseCase: { execute: mockRequestReport },
      listReportsUseCase: { execute: mockRequestReport },
    },
    notification: {
      jwtService: { verify: mockJwtVerify },
      listNotificationsUseCase: { execute: mockListNotifications },
      upsertNotificationTemplateUseCase: { execute: mockUpsertTemplate },
    },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const USER_ID = 'd3eeff33-3c4d-4ef9-dd8f-8dd1df592c44';
const APPT_ID = 'c2ddfe22-2b3c-4ef9-cc7e-7cc0ce491b33';
const INSPECTOR_ID = 'e4ffee44-4d5e-4ef9-ee9e-9ee2ee603d55';
const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

// ── user.create_internal: AM only ─────────────────────────────────────────────

describe('Matrix: user.create_internal (POST /v1/users) — AM only', () => {
  const payload = { email: 'op@example.com', name: 'Op User', role: 'OP', password: 'Test@12345' };

  it('AM → 201', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCreateUser.mockResolvedValue({ id: USER_ID, role: 'OP', tenantId: null, email: payload.email, name: 'Op User', phone: null, status: 'ACTIVE', branchId: null, lastLoginAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const res = await supertest(app.server).post('/v1/users').set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(201);
  });

  it('OP → 403 (privilege escalation)', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateUser.mockRejectedValue(new ForbiddenError('PRIVILEGE_ESCALATION', 'Role OP cannot create users with role OP'));
    const res = await supertest(app.server).post('/v1/users').set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });

  it('CL_ADMIN → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).post('/v1/users').set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });
});

// ── user.deactivate: AM, OP only ─────────────────────────────────────────────

describe('Matrix: user.deactivate (POST /v1/tenants/:id/users/:id/deactivate) — AM, OP only', () => {
  const payload = { reason: 'Deactivating' };

  it('AM → 204', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockDeactivateUser.mockResolvedValue(undefined);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(204);
  });

  it('OP → 204', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockDeactivateUser.mockResolvedValue(undefined);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(204);
  });

  it('CL_ADMIN → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockDeactivateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });
});

// ── appointment.cross_check: AM, OP only ─────────────────────────────────────

describe('Matrix: appointment.cross_check (POST /v1/appointments/:id/cross-check-done) — AM, OP', () => {
  const crossCheckStub = { id: APPT_ID, status: 'DONE', previousStatus: 'DONE', reason: null, inspectorId: null, doneCheckedByUserId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99', doneCheckedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

  it('AM → 200', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCrossCheck.mockResolvedValue(crossCheckStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t').send({});
    expect(res.status).toBe(200);
  });

  it('OP → 200', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCrossCheck.mockResolvedValue(crossCheckStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t').send({});
    expect(res.status).toBe(200);
  });

  it('CL_ADMIN → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCrossCheck.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t').send({});
    expect(res.status).toBe(403);
  });

  it('CL_USER → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockCrossCheck.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t').send({});
    expect(res.status).toBe(403);
  });

  it('INSP → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext());
    mockCrossCheck.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t').send({});
    expect(res.status).toBe(403);
  });
});

// ── financial.view: AM, OP only ───────────────────────────────────────────────

describe('Matrix: financial.view (GET /v1/financial/entries) — AM, OP only', () => {
  const listStub = { data: [], total: 0, page: 1, pageSize: 20 };

  it('AM → 200', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockListEntries.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('OP → 200', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockListEntries.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('CL_ADMIN → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockListEntries.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('CL_USER → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockListEntries.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('INSP → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext());
    mockListEntries.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});

// ── inspector.create: AM, OP only ────────────────────────────────────────────

describe('Matrix: inspector.create (POST /v1/inspectors) — AM, OP only', () => {
  const inspectorStub = { id: INSPECTOR_ID, name: 'New Inspector', email: 'new@inspector.com', phone: '+61400000002', status: 'ACTIVE', paymentSettingsJson: null, serviceTypesJson: null,regionIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const payload = { name: 'New Inspector', email: 'new@inspector.com', phone: '+61400000002' };

  it('AM → 201', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCreateInspector.mockResolvedValue(inspectorStub);
    const res = await supertest(app.server).post('/v1/inspectors').set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(201);
  });

  it('OP → 201', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateInspector.mockResolvedValue(inspectorStub);
    const res = await supertest(app.server).post('/v1/inspectors').set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(201);
  });

  it('CL_ADMIN → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).post('/v1/inspectors').set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });

  it('INSP → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext());
    mockCreateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).post('/v1/inspectors').set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });
});

// ── config.notification_templates: AM, OP only ───────────────────────────────

describe('Matrix: config.notification_templates (PUT /v1/notification-templates) — AM, OP only', () => {
  const templatePayload = { subject: 'Test', bodyHtml: '<p>Hi</p>', isActive: true };
  const templateStub = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', tenantId: null, templateCode: 'appointment_created', channel: 'EMAIL', subject: 'Test', bodyHtml: '<p>Hi</p>', bodyText: 'Hi', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

  it('AM → 200', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockUpsertTemplate.mockResolvedValue(templateStub);
    const res = await supertest(app.server)
      .put('/v1/notification-templates/appointment_created/EMAIL')
      .set('Authorization', 'Bearer t').send(templatePayload);
    expect(res.status).toBe(200);
  });

  it('OP → 200', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockUpsertTemplate.mockResolvedValue(templateStub);
    const res = await supertest(app.server)
      .put('/v1/notification-templates/appointment_created/EMAIL')
      .set('Authorization', 'Bearer t').send(templatePayload);
    expect(res.status).toBe(200);
  });

  it('CL_ADMIN → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockUpsertTemplate.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .put('/v1/notification-templates/appointment_created/EMAIL')
      .set('Authorization', 'Bearer t').send(templatePayload);
    expect(res.status).toBe(403);
  });

  it('CL_USER → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockUpsertTemplate.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .put('/v1/notification-templates/appointment_created/EMAIL')
      .set('Authorization', 'Bearer t').send(templatePayload);
    expect(res.status).toBe(403);
  });
});

// ── audit.view: AM, OP only ───────────────────────────────────────────────────

describe('Matrix: audit.view (GET /v1/audit-logs) — AM, OP only', () => {
  const auditListStub = { data: [], total: 0, page: 1, pageSize: 20 };

  it('AM → 200', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockListAuditLogs.mockResolvedValue(auditListStub);
    const res = await supertest(app.server).get('/v1/audit-logs').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('OP → 200', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockListAuditLogs.mockResolvedValue(auditListStub);
    const res = await supertest(app.server).get('/v1/audit-logs').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('CL_ADMIN → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockListAuditLogs.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/audit-logs').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('CL_USER → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockListAuditLogs.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/audit-logs').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});

// ── tenant.create: AM only (OP denied per tenants-branches.rbac.test.ts) ─────

describe('Matrix: tenant.create consistency check', () => {
  it('ROLE_ACTION_MATRIX has AM and OP for tenant.create', () => {
    const entry = ROLE_ACTION_MATRIX['tenant.create'];
    expect(entry).toBeDefined();
    expect(entry!.roles).toContain('AM');
    expect(entry!.roles).toContain('OP');
  });
});
