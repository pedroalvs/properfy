/**
 * 031 PR-4: Agency financial read RBAC.
 *
 * GET /v1/financial/entries and GET /v1/financial/entries/summary are readable by
 * AM / OP (backoffice) and CL_ADMIN (own agency) unconditionally, and by CL_USER
 * only when the agency has the `view_financials` flag. INSP may read the entries
 * list (own payouts) but NOT the agency summary. The `view_financials` flag is
 * resolved from tenant settings by the billing auth middleware.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockListEntries = vi.fn();
const mockGetSummary = vi.fn();
const mockJwtVerify = vi.fn();
const mockTenantFindById = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
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
      inspectorExecution: { jwtService: { verify: mockJwtVerify } },
      billing: {
        listFinancialEntriesUseCase: { execute: mockListEntries },
        getFinancialSummaryUseCase: { execute: mockGetSummary },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: mockTenantFindById },
      },
      report: { jwtService: { verify: mockJwtVerify } },
      notification: { jwtService: { verify: mockJwtVerify } },
      serviceRegion: { jwtService: { verify: mockJwtVerify } },
      contact: { jwtService: { verify: mockJwtVerify } },
      appointmentTimeSlot: { jwtService: { verify: mockJwtVerify } },
      dashboard: { jwtService: { verify: mockJwtVerify } },
    } as any),
}));

const TENANT_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01';
const clAdmin = { userId: 'u-cladmin', tenantId: TENANT_ID, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUser = { userId: 'u-cluser', tenantId: TENANT_ID, role: 'CL_USER', branchId: null, inspectorId: null };
const insp = { userId: 'u-insp', tenantId: TENANT_ID, role: 'INSP', branchId: null, inspectorId: 'insp-1' };
const am = { userId: 'u-am', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const emptyPage = { data: [], total: 0, page: 1, pageSize: 20 };
const summary = { totalDebits: 0, totalPayouts: 0, totalAdjustments: 0, totalRefunds: 0, pendingCount: 0, currency: 'AUD' };

/** Agency has the `view_financials` flag enabled for its CL_USER cohort. */
function tenantWithFlag() {
  mockTenantFindById.mockResolvedValue({ isActive: () => true, settingsJson: { clUserPermissions: ['view_financials'] } });
}
/** Agency without the flag. */
function tenantWithoutFlag() {
  mockTenantFindById.mockResolvedValue({ isActive: () => true, settingsJson: { clUserPermissions: [] } });
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});
afterAll(async () => { await app.close(); });
beforeEach(() => {
  vi.clearAllMocks();
  mockListEntries.mockResolvedValue(emptyPage);
  mockGetSummary.mockResolvedValue(summary);
});

describe('031 PR-4 — GET /v1/financial/entries agency read', () => {
  it('CL_ADMIN → 200 (own agency, unconditional)', async () => {
    tenantWithoutFlag();
    mockJwtVerify.mockResolvedValueOnce(clAdmin);
    await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t').expect(200);
    expect(mockListEntries).toHaveBeenCalledOnce();
  });

  it('CL_USER with view_financials → 200', async () => {
    tenantWithFlag();
    mockJwtVerify.mockResolvedValueOnce(clUser);
    await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t').expect(200);
    expect(mockListEntries).toHaveBeenCalledOnce();
  });

  it('CL_USER without view_financials → 403 and use case not called', async () => {
    tenantWithoutFlag();
    mockJwtVerify.mockResolvedValueOnce(clUser);
    const res = await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t').expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockListEntries).not.toHaveBeenCalled();
  });

  it('INSP → 200 (own payouts allowed on entries list)', async () => {
    mockJwtVerify.mockResolvedValueOnce(insp);
    await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t').expect(200);
    expect(mockListEntries).toHaveBeenCalledOnce();
  });
});

describe('031 PR-4 — GET /v1/financial/entries/summary agency read', () => {
  it('CL_ADMIN → 200', async () => {
    tenantWithoutFlag();
    mockJwtVerify.mockResolvedValueOnce(clAdmin);
    await supertest(app.server).get('/v1/financial/entries/summary').set('Authorization', 'Bearer t').expect(200);
    expect(mockGetSummary).toHaveBeenCalledOnce();
  });

  it('CL_USER with view_financials → 200', async () => {
    tenantWithFlag();
    mockJwtVerify.mockResolvedValueOnce(clUser);
    await supertest(app.server).get('/v1/financial/entries/summary').set('Authorization', 'Bearer t').expect(200);
    expect(mockGetSummary).toHaveBeenCalledOnce();
  });

  it('CL_USER without view_financials → 403 and use case not called', async () => {
    tenantWithoutFlag();
    mockJwtVerify.mockResolvedValueOnce(clUser);
    const res = await supertest(app.server).get('/v1/financial/entries/summary').set('Authorization', 'Bearer t').expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockGetSummary).not.toHaveBeenCalled();
  });

  it('INSP → 403 (inspectors have no agency summary)', async () => {
    mockJwtVerify.mockResolvedValueOnce(insp);
    const res = await supertest(app.server).get('/v1/financial/entries/summary').set('Authorization', 'Bearer t').expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockGetSummary).not.toHaveBeenCalled();
  });

  it('AM → 200', async () => {
    mockJwtVerify.mockResolvedValueOnce(am);
    await supertest(app.server).get('/v1/financial/entries/summary').set('Authorization', 'Bearer t').expect(200);
    expect(mockGetSummary).toHaveBeenCalledOnce();
  });
});
