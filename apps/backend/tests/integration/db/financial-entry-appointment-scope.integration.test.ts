/**
 * Appointment-scoped financial ledger — real database verification.
 *
 * The `appointment/{id}` "Financial" tab calls `GET /v1/financial/entries`
 * with an `appointmentId` filter. Before this fix, the query schema
 * (`listFinancialEntriesQuerySchema`) did not declare `appointmentId`, so
 * Zod silently stripped it and `ListFinancialEntriesUseCase` returned the
 * entire tenant ledger regardless of which appointment was open — a
 * newly-created appointment appeared to already have financial "history"
 * that actually belonged to other appointments in the same tenant.
 *
 * This test proves the fix against a real PostgreSQL database (not mocks —
 * a mocked repository would return its stub regardless of the WHERE clause
 * and hide exactly this kind of filter regression).
 *
 * What's covered:
 *   1. One tenant, two appointments (A and B), each with its own
 *      TENANT_DEBIT + INSPECTOR_PAYOUT pair.
 *   2. AM/OP with `appointmentId=A` → sees only A's two entries.
 *   3. AM/OP with `appointmentId=B` → sees only B's two entries.
 *   4. No `appointmentId` → still sees all four entries (existing
 *      behaviour preserved).
 *   5. CL_ADMIN with `appointmentId=A` → sees A's TENANT_DEBIT but not
 *      A's INSPECTOR_PAYOUT (agency entry-type scoping still enforced —
 *      the appointment filter is additive, never a bypass).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { ListFinancialEntriesUseCase } from '../../../src/modules/billing/application/use-cases/list-financial-entries.use-case';
import { PrismaFinancialEntryRepository } from '../../../src/modules/billing/infrastructure/prisma-financial-entry.repository';

function silentAuditService() {
  return { log: () => {} } as unknown as import('../../../src/shared/infrastructure/audit').AuditService;
}

function amActor(): AuthContext {
  return { userId: 'am-actor', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
}

function opActor(tenantId: string): AuthContext {
  return { userId: 'op-actor', tenantId, role: 'OP', branchId: null, inspectorId: null };
}

function clAdminActor(tenantId: string): AuthContext {
  return { userId: 'cl-admin-actor', tenantId, role: 'CL_ADMIN', branchId: null, inspectorId: null };
}

interface AppointmentLedgerFixture {
  tenantId: string;
  appointmentId: string;
  tenantDebitId: string;
  inspectorPayoutId: string;
}

describe('Appointment-scoped financial ledger (real DB)', () => {
  let harness: DbHarness | undefined;
  let tenantId: string;
  let fixtureA: AppointmentLedgerFixture;
  let fixtureB: AppointmentLedgerFixture;

  beforeAll(async () => {
    harness = await setupDbHarness();
    const { prisma } = harness;

    const tenant = await prisma.tenant.create({
      data: {
        name: 'Appointment Financial Scope Tenant',
        legal_name: `Appointment Financial Scope LLC ${Math.random().toString(36).slice(2, 10)}`,
        status: 'ACTIVE',
      },
    });
    tenantId = tenant.id;

    const branch = await prisma.branch.create({
      data: { tenant_id: tenant.id, name: 'Main Branch', status: 'ACTIVE' },
    });
    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        role: 'OP',
        name: 'Fixture Actor',
        email: `fixture-${Math.random().toString(36).slice(2, 10)}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
        status: 'ACTIVE',
      },
    });
    const property = await prisma.property.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        property_code: `PROP-${Math.random().toString(36).slice(2, 10)}`,
        type: 'HOUSE',
        street: '1 Test St',
        suburb: 'Test',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        geocoding_status: 'SUCCESS',
      },
    });
    const serviceType = await prisma.serviceType.create({
      data: {
        code: `ST-${Math.random().toString(36).slice(2, 10)}`,
        name: 'Routine Inspection',
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });
    const inspector = await prisma.inspector.create({
      data: {
        name: 'Fixture Inspector',
        email: `inspector-${Math.random().toString(36).slice(2, 10)}@test.local`,
        status: 'ACTIVE',
      },
    });

    async function seedAppointmentWithLedger(label: string): Promise<AppointmentLedgerFixture> {
      const appointment = await prisma.appointment.create({
        data: {
          tenant_id: tenant.id,
          branch_id: branch.id,
          property_id: property.id,
          service_type_id: serviceType.id,
          inspector_id: inspector.id,
          status: 'DONE',
          scheduled_date: new Date('2026-05-01'),
          time_slot_start: '09:00',
          time_slot_end: '12:00',
          price_amount: '100.00',
          payout_amount: '80.00',
          pricing_rule_snapshot_json: {},
          rental_tenant_confirmation_status: 'CONFIRMED',
          created_by_user_id: user.id,
          done_marked_by_user_id: user.id,
          done_checked_by_user_id: user.id,
          done_checked_at: new Date('2026-05-01T12:00:00.000Z'),
        },
      });

      const tenantDebit = await prisma.financialEntry.create({
        data: {
          tenant_id: tenant.id,
          appointment_id: appointment.id,
          entry_type: 'TENANT_DEBIT',
          amount: '100.00',
          currency: 'AUD',
          status: 'PENDING',
          description: `Tenant debit for ${label}`,
          effective_at: new Date('2026-05-01T12:00:00.000Z'),
          initiated_by_user_id: user.id,
        },
      });

      const inspectorPayout = await prisma.financialEntry.create({
        data: {
          tenant_id: tenant.id,
          appointment_id: appointment.id,
          inspector_id: inspector.id,
          entry_type: 'INSPECTOR_PAYOUT',
          amount: '80.00',
          currency: 'AUD',
          status: 'PENDING',
          description: `Inspector payout for ${label}`,
          effective_at: new Date('2026-05-01T12:00:00.000Z'),
          initiated_by_user_id: user.id,
        },
      });

      return {
        tenantId: tenant.id,
        appointmentId: appointment.id,
        tenantDebitId: tenantDebit.id,
        inspectorPayoutId: inspectorPayout.id,
      };
    }

    fixtureA = await seedAppointmentWithLedger('Appointment A');
    fixtureB = await seedAppointmentWithLedger('Appointment B');
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function makeUseCase(): ListFinancialEntriesUseCase {
    if (!harness) throw new Error('harness not initialized');
    const entryRepo = new PrismaFinancialEntryRepository(harness.prisma);
    return new ListFinancialEntriesUseCase(entryRepo, silentAuditService());
  }

  const defaultInput = { page: 1, pageSize: 50, sortBy: 'effectiveAt', sortOrder: 'desc' as const };

  it('AM with appointmentId=A sees only A entries, not B', async () => {
    const useCase = makeUseCase();
    const result = await useCase.execute({ ...defaultInput, appointmentId: fixtureA.appointmentId, actor: amActor() });

    const ids = result.data.map((e) => e.id);
    expect(ids.sort()).toEqual([fixtureA.tenantDebitId, fixtureA.inspectorPayoutId].sort());
    expect(ids).not.toContain(fixtureB.tenantDebitId);
    expect(ids).not.toContain(fixtureB.inspectorPayoutId);
  });

  it('AM with appointmentId=B sees only B entries, not A', async () => {
    const useCase = makeUseCase();
    const result = await useCase.execute({ ...defaultInput, appointmentId: fixtureB.appointmentId, actor: amActor() });

    const ids = result.data.map((e) => e.id);
    expect(ids.sort()).toEqual([fixtureB.tenantDebitId, fixtureB.inspectorPayoutId].sort());
    expect(ids).not.toContain(fixtureA.tenantDebitId);
    expect(ids).not.toContain(fixtureA.inspectorPayoutId);
  });

  it('OP with appointmentId=A sees only A entries within their tenant', async () => {
    const useCase = makeUseCase();
    const result = await useCase.execute({
      ...defaultInput,
      appointmentId: fixtureA.appointmentId,
      actor: opActor(tenantId),
    });

    const ids = result.data.map((e) => e.id);
    expect(ids.sort()).toEqual([fixtureA.tenantDebitId, fixtureA.inspectorPayoutId].sort());
  });

  it('AM without appointmentId still sees entries from both appointments (unfiltered behaviour preserved)', async () => {
    const useCase = makeUseCase();
    const result = await useCase.execute({ ...defaultInput, actor: amActor() });

    const ids = result.data.map((e) => e.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        fixtureA.tenantDebitId,
        fixtureA.inspectorPayoutId,
        fixtureB.tenantDebitId,
        fixtureB.inspectorPayoutId,
      ]),
    );
  });

  it('CL_ADMIN with appointmentId=A sees the TENANT_DEBIT but not the INSPECTOR_PAYOUT (entry-type scope preserved)', async () => {
    const useCase = makeUseCase();
    const result = await useCase.execute({
      ...defaultInput,
      appointmentId: fixtureA.appointmentId,
      actor: clAdminActor(tenantId),
    });

    const ids = result.data.map((e) => e.id);
    expect(ids).toContain(fixtureA.tenantDebitId);
    expect(ids).not.toContain(fixtureA.inspectorPayoutId);
    expect(ids).not.toContain(fixtureB.tenantDebitId);
  });
});
