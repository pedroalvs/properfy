import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockGetAppointmentDetailExecute = vi.fn();
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
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: {
      getAppointmentDetailUseCase: { execute: mockGetAppointmentDetailExecute },
      jwtService: { verify: mockJwtVerify },
    },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const APPOINTMENT_ID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';

const inspContext = { userId: 'insp-1', tenantId: 'tenant-1', role: 'INSP', branchId: null, inspectorId: 'insp-1' };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

const baseDetail = {
  id: APPOINTMENT_ID,
  propertyId: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
  serviceTypeId: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
  status: 'SCHEDULED',
  scheduledDate: '2026-04-12',
  timeSlot: '09:00-10:00',
  timeSlotStart: '2026-04-12T09:00:00',
  timeSlotEnd: '2026-04-12T10:00:00',
  serviceTypeName: 'Routine Inspection',
  flowType: 'ROUTINE',
  propertyAddress: '42 Wallaby Way, Sydney',
  suburb: 'Sydney',
  propertyLatitude: -33.8688,
  propertyLongitude: 151.2093,
  keyRequired: false,
  meetingLocation: null,
  keyLocation: null,
  rentalTenantConfirmationStatus: 'CONFIRMED',
  rentalTenantConfirmation: 'CONFIRMED',
  rentalTenantName: 'John Smith',
  rentalTenantPhone: '+61400000000',
  rentalTenantEmail: 'john@example.com',
  notes: null,
  observation: null,
  restrictionsSummary: null,
  contact: null,
  restrictions: [],
  execution: null,
  assets: [],
};

describe('GET /v1/inspector/appointments/:appointmentId — job details enrichment', () => {
  it('should return 200 with all detail sections', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const enriched = {
      ...baseDetail,
      agencyName: 'Alpha Realty',
      payoutAmount: 8500,
      inspectionAppLink: 'https://app.inspect.com/session/abc123',
    };
    mockGetAppointmentDetailExecute.mockResolvedValueOnce(enriched);

    const res = await supertest(app.server)
      .get(`/v1/inspector/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(APPOINTMENT_ID);
    expect(res.body.data.propertyAddress).toBe('42 Wallaby Way, Sydney');
    expect(res.body.data.serviceTypeName).toBe('Routine Inspection');
    expect(res.body.data.rentalTenantName).toBe('John Smith');
  });

  it('should omit inspectionAppLink when not configured', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetAppointmentDetailExecute.mockResolvedValueOnce(baseDetail);

    const res = await supertest(app.server)
      .get(`/v1/inspector/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.inspectionAppLink).toBeUndefined();
  });

  it('should expose payout amount (not tenant price) in the payment section', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const withPayout = {
      ...baseDetail,
      payoutAmount: 7500,
    };
    mockGetAppointmentDetailExecute.mockResolvedValueOnce(withPayout);

    const res = await supertest(app.server)
      .get(`/v1/inspector/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.payoutAmount).toBe(7500);
  });

  it('should include jobDetails in the serialized response when present', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const withJobDetails = {
      ...baseDetail,
      agencyName: 'Alpha Realty',
      payoutAmount: 8500,
      jobDetails: {
        agency: { id: 'tenant-1', name: 'Alpha Realty' },
        tenantContacts: [
          { name: 'John Smith', email: 'john@example.com', phone: '+61400000000', role: 'RENTAL_TENANT', isPrimary: true },
        ],
        keys: { keyRequired: false, keyLocation: null },
        propertyManager: null,
        payment: { payoutAmount: 8500, currency: 'AUD' },
      },
    };
    mockGetAppointmentDetailExecute.mockResolvedValueOnce(withJobDetails);

    const res = await supertest(app.server)
      .get(`/v1/inspector/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.jobDetails).toBeDefined();
    expect(res.body.data.jobDetails.agency.name).toBe('Alpha Realty');
    expect(res.body.data.jobDetails.tenantContacts).toHaveLength(1);
    expect(res.body.data.jobDetails.payment.currency).toBe('AUD');
    expect(res.body.data.jobDetails.propertyManager).toBeNull();
  });

  it('should return snapshot-based tenant contact fields', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const withSnapshot = {
      ...baseDetail,
      rentalTenantName: 'Snapshot Name',
      rentalTenantPhone: '+61499999999',
      rentalTenantEmail: 'snapshot@example.com',
    };
    mockGetAppointmentDetailExecute.mockResolvedValueOnce(withSnapshot);

    const res = await supertest(app.server)
      .get(`/v1/inspector/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.rentalTenantName).toBe('Snapshot Name');
    expect(res.body.data.rentalTenantPhone).toBe('+61499999999');
    expect(res.body.data.rentalTenantEmail).toBe('snapshot@example.com');
  });
});
