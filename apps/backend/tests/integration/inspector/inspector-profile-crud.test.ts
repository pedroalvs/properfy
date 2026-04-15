import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockCreateInspectorExecute = vi.fn();
const mockUpdateInspectorExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: {
      createInspectorUseCase: { execute: mockCreateInspectorExecute },
      updateInspectorUseCase: { execute: mockUpdateInspectorExecute },
      jwtService: { verify: mockJwtVerify },
    },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const INSPECTOR_ID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: 'tenant-1', role: 'CL_USER', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

const now = new Date().toISOString();

const fullProfileInspector = {
  id: INSPECTOR_ID,
  userId: 'user-insp-1',
  name: 'Jane Inspector',
  email: 'jane@inspect.com',
  phone: '+61400000000',
  status: 'ACTIVE',
  fullName: 'Jane Margaret Inspector',
  abn: '12345678901',
  dateOfBirth: '1990-05-15',
  blockedClientsJson: ['b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
  paymentSettingsJson: {},
  regionIds: [],
  serviceTypesJson: [],
  clientEligibilityJson: [],
  createdAt: now,
  updatedAt: now,
};

describe('POST /v1/inspectors — profile fields', () => {
  it('should return 201 with all profile fields (fullName, abn, dateOfBirth, blockedClients)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreateInspectorExecute.mockResolvedValueOnce(fullProfileInspector);

    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'Jane Inspector',
        email: 'jane@inspect.com',
        phone: '+61400000000',
        fullName: 'Jane Margaret Inspector',
        abn: '12345678901',
        dateOfBirth: '1990-05-15',
        blockedClients: ['b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(mockCreateInspectorExecute).toHaveBeenCalledOnce();
  });

  it('should return 201 with minimal fields (no profile, all nullable)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const minimalInspector = {
      id: INSPECTOR_ID,
      userId: 'user-insp-2',
      name: 'Min Inspector',
      email: 'min@inspect.com',
      phone: null,
      status: 'ACTIVE',
      paymentSettingsJson: {},
      regionIds: [],
      serviceTypesJson: [],
      clientEligibilityJson: [],
      createdAt: now,
      updatedAt: now,
    };
    mockCreateInspectorExecute.mockResolvedValueOnce(minimalInspector);

    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Min Inspector', email: 'min@inspect.com' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Min Inspector');
  });

  it('should return 403 when CL_USER tries to create an inspector', async () => {
    mockJwtVerify.mockResolvedValueOnce(clUserContext);
    mockCreateInspectorExecute.mockRejectedValueOnce(
      new ForbiddenError('FORBIDDEN', 'Role CL_USER is not permitted to perform inspector.create'),
    );

    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Test Inspector', email: 'test@inspect.com' });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /v1/inspectors/:inspectorId — blockedClients update', () => {
  it('should return 200 when updating blockedClients', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const updatedInspector = {
      ...fullProfileInspector,
      blockedClientsJson: [
        'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      ],
    };
    mockUpdateInspectorExecute.mockResolvedValueOnce(updatedInspector);

    const res = await supertest(app.server)
      .patch(`/v1/inspectors/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        blockedClients: [
          'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          'b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        ],
      });

    expect(res.status).toBe(200);
    expect(mockUpdateInspectorExecute).toHaveBeenCalledOnce();
  });
});
