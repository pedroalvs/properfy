/**
 * Real-database test for the appointments XLSX export.
 *
 * The unit test proves the row mapping against a mocked repository; this proves
 * the whole path — real Prisma reads, the real ExcelJS generator, a real
 * workbook parsed back — so a column whose key never resolves (a blank sheet
 * column) or a filter that fails to narrow shows up here rather than in QA.
 *
 * Requires Docker (testcontainers). Run a single file via:
 *   pnpm exec vitest run --config vitest.integration-db.config.ts \
 *     tests/integration/db/appointment-export.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { ExcelJsXlsxGenerator } from '../../../src/modules/report/infrastructure/exceljs-xlsx-generator';
import { ExportAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/export-appointments.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

let harness: DbHarness;
let useCase: ExportAppointmentsUseCase;

beforeAll(async () => {
  harness = await setupDbHarness();
  useCase = new ExportAppointmentsUseCase(
    new PrismaAppointmentRepository(harness.prisma),
    new ExcelJsXlsxGenerator(),
    new AuthorizationService({ log: vi.fn() } as any),
  );
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE appointments, properties, service_types, users, branches, tenants CASCADE`,
  );
});

const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
}

/** Parses the base64 workbook back into a header row + data rows. */
async function readSheet(contentBase64: string): Promise<{ headers: string[]; rows: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(contentBase64, 'base64'));
  const sheet = workbook.worksheets[0]!;
  const headers: string[] = [];
  const rows: string[][] = [];
  sheet.eachRow((row, rowNumber) => {
    const values = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v)));
    if (rowNumber === 1) headers.push(...values);
    else rows.push(values);
  });
  return { headers, rows };
}

async function seedAppointment(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    branchId: string;
    userId: string;
    serviceTypeId: string;
    suburb: string;
    propertyCode: string;
    status?: 'DRAFT' | 'CANCELLED' | 'REJECTED';
    cancellationReasonCode?: string;
    rejectionReasonCode?: string;
    reason?: string;
  },
): Promise<void> {
  const property = await prisma.property.create({
    data: {
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      property_code: params.propertyCode,
      type: 'HOUSE',
      street: `${rand()} Test St`,
      suburb: params.suburb,
      postcode: '2000',
      state: 'NSW',
    },
  });
  await prisma.appointment.create({
    data: {
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      property_id: property.id,
      service_type_id: params.serviceTypeId,
      status: params.status ?? 'DRAFT',
      scheduled_date: FUTURE_DATE,
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: params.userId,
      ...(params.cancellationReasonCode ? { cancellation_reason_code: params.cancellationReasonCode } : {}),
      ...(params.rejectionReasonCode ? { rejection_reason_code: params.rejectionReasonCode } : {}),
      ...(params.reason ? { reason: params.reason } : {}),
    },
  });
}

async function seedServiceType(prisma: PrismaClient): Promise<string> {
  const st = await prisma.serviceType.create({
    data: {
      code: `ST-${rand()}`,
      name: 'Routine Inspection',
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  return st.id;
}

describe('ExportAppointmentsUseCase — real database', () => {
  it('produces a workbook whose every column carries a value', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branch = await harness.prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantId } });
    const serviceTypeId = await seedServiceType(harness.prisma);
    await seedAppointment(harness.prisma, {
      tenantId, branchId: branch.id, userId, serviceTypeId,
      suburb: 'Bondi', propertyCode: 'ACME-PROP-0007',
      status: 'CANCELLED', cancellationReasonCode: 'CLIENT_REQUEST', reason: 'Tenant moved out early',
    });

    // `showCancelled` is required to see a CANCELLED row — the export honours the
    // list's default status exclusion (see the dedicated test below).
    const result = await useCase.execute({ filters: { showCancelled: true }, actor: makeActor() });
    const { headers, rows } = await readSheet(result.contentBase64);

    expect(rows).toHaveLength(1);
    const row = Object.fromEntries(headers.map((h, i) => [h, rows[0]![i] ?? '']));
    expect(row['Agency']).toBe('Agency A');
    expect(row['Service Type']).toBe('Routine Inspection');
    expect(row['Property Code']).toBe('ACME-PROP-0007');
    expect(row['Suburb']).toBe('Bondi');
    expect(row['Status']).toBe('CANCELLED');
    expect(row['Time Slot']).toBe('09:00 - 12:00');
    expect(row['Cancellation Reason']).toBe('Client Request');
    expect(row['Reason Detail']).toBe('Tenant moved out early');
    // A column key that never resolves to a row key ships a silently blank
    // column — the failure mode a mocked generator cannot see.
    for (const header of ['Code', 'Address', 'Scheduled Date', 'Created At']) {
      expect(row[header], `${header} is blank`).not.toBe('');
    }
  });

  it('exports only the rows matching the filters', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branch = await harness.prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantId } });
    const serviceTypeId = await seedServiceType(harness.prisma);
    await seedAppointment(harness.prisma, {
      tenantId, branchId: branch.id, userId, serviceTypeId, suburb: 'Bondi', propertyCode: 'P-BONDI',
    });
    await seedAppointment(harness.prisma, {
      tenantId, branchId: branch.id, userId, serviceTypeId, suburb: 'Newtown', propertyCode: 'P-NEWTOWN',
    });

    const result = await useCase.execute({ filters: { suburb: 'Bondi' }, actor: makeActor() });
    const { headers, rows } = await readSheet(result.contentBase64);

    const codeIndex = headers.indexOf('Property Code');
    expect(rows.map((r) => r[codeIndex])).toEqual(['P-BONDI']);
  });

  // The export must show exactly what the list shows. The list hides CANCELLED
  // and REJECTED unless "Show cancelled" is on, so the export does too — which
  // also means the Cancellation Reason column only fills in once it is enabled.
  it('mirrors the list default of hiding cancelled rows', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branch = await harness.prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantId } });
    const serviceTypeId = await seedServiceType(harness.prisma);
    await seedAppointment(harness.prisma, {
      tenantId, branchId: branch.id, userId, serviceTypeId, suburb: 'Bondi', propertyCode: 'P-ACTIVE',
    });
    await seedAppointment(harness.prisma, {
      tenantId, branchId: branch.id, userId, serviceTypeId, suburb: 'Bondi', propertyCode: 'P-CANCELLED',
      status: 'CANCELLED', cancellationReasonCode: 'CLIENT_REQUEST',
    });

    const withoutCancelled = await useCase.execute({ filters: {}, actor: makeActor() });
    const plain = await readSheet(withoutCancelled.contentBase64);
    const codeIndex = plain.headers.indexOf('Property Code');
    expect(plain.rows.map((r) => r[codeIndex])).toEqual(['P-ACTIVE']);

    const withCancelled = await useCase.execute({
      filters: { showCancelled: true },
      actor: makeActor(),
    });
    const full = await readSheet(withCancelled.contentBase64);
    expect(full.rows.map((r) => r[codeIndex]).sort()).toEqual(['P-ACTIVE', 'P-CANCELLED']);
  });

  it('reports the rejection reason for a REJECTED row', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branch = await harness.prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantId } });
    const serviceTypeId = await seedServiceType(harness.prisma);
    await seedAppointment(harness.prisma, {
      tenantId, branchId: branch.id, userId, serviceTypeId, suburb: 'Bondi', propertyCode: 'P-REJ',
      status: 'REJECTED', rejectionReasonCode: 'TENANT_DECLINED',
    });

    const result = await useCase.execute({ filters: { showCancelled: true }, actor: makeActor() });
    const { headers, rows } = await readSheet(result.contentBase64);

    const reasonIndex = headers.indexOf('Cancellation Reason');
    expect(rows[0]![reasonIndex]).toBe('Tenant Declined');
  });

  it('never leaks another agency into a CL_ADMIN export', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchA = await harness.prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantId } });
    const serviceTypeId = await seedServiceType(harness.prisma);
    await seedAppointment(harness.prisma, {
      tenantId, branchId: branchA.id, userId, serviceTypeId, suburb: 'Bondi', propertyCode: 'P-A',
    });

    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const branchB = await harness.prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantB } });
    await seedAppointment(harness.prisma, {
      tenantId: tenantB, branchId: branchB.id, userId: userB, serviceTypeId,
      suburb: 'Bondi', propertyCode: 'P-B',
    });

    // Agency A's admin asking for Agency B must still get only its own rows.
    const result = await useCase.execute({
      filters: { tenantId: tenantB },
      actor: makeActor({ role: 'CL_ADMIN', tenantId }),
    });
    const { headers, rows } = await readSheet(result.contentBase64);

    const codeIndex = headers.indexOf('Property Code');
    expect(rows.map((r) => r[codeIndex])).toEqual(['P-A']);
  });
});
