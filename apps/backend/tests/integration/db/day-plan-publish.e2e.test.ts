/**
 * End-to-end publish (T035, contract 00.A2 / 01.A1 / 00.A5): with the T-1 claim in
 * place and Mapbox absent (stub router), the 19:30 batch computes and persists a
 * PUBLISHED plan with frozen published ETAs and route geometry, creates the critical
 * ROUTE_PUBLISHED notice, and enqueues its delivery job — all against a real Postgres.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import type { IPlatformSettingsReader } from '../../../src/shared/domain/platform-settings';
import type { AuditService } from '../../../src/shared/domain/audit';
import type { IJobQueue, JobOptions } from '../../../src/shared/domain/job-queue';
import { metrics } from '../../../src/shared/infrastructure/metrics';
import { PrismaDayPlanRepository } from '../../../src/modules/day-plan/infrastructure/prisma-day-plan.repository';
import { PrismaDayPlanInputReader } from '../../../src/modules/day-plan/infrastructure/prisma-day-plan-input.reader';
import { StubRoutingService } from '../../../src/modules/day-plan/infrastructure/routing/stub-routing.service';
import { PlanRouteService } from '../../../src/modules/day-plan/application/services/plan-route.service';
import { ComputeDayPlanUseCase } from '../../../src/modules/day-plan/application/use-cases/compute-day-plan.use-case';
import { PublishDayPlansUseCase } from '../../../src/modules/day-plan/application/use-cases/publish-day-plans.use-case';
import { PrismaInspectorNoticeRepository } from '../../../src/modules/inspector-notice/infrastructure/prisma-inspector-notice.repository';
import { PrismaInspectorDirectoryRepository } from '../../../src/modules/inspector-notice/infrastructure/prisma-inspector-directory.repository';
import { PublishSystemInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/publish-system-inspector-notice.use-case';

let harness: DbHarness;

// 2026-11-04 19:30 AEDT — the publication window for 2026-11-05 is open.
const NOW = new Date('2026-11-04T08:30:00.000Z');

const silentLogger = {
  info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {},
  child() { return silentLogger; },
} as never;

const noopAudit: AuditService = { log() {} };
const settingsStub = { get: async () => ({ travel: 1, windowWait: 1, baseProximity: 1 }) } as unknown as IPlatformSettingsReader;

class CapturingJobQueue implements IJobQueue {
  readonly enqueued: Array<{ name: string; payload: Record<string, unknown>; options?: JobOptions }> = [];
  async enqueue(name: string, payload: Record<string, unknown>, options?: JobOptions): Promise<void> {
    this.enqueued.push({ name, payload, options });
  }
}

const seed = { inspectorId: '' };

beforeAll(async () => {
  harness = await setupDbHarness();
  const p = harness.prisma;

  const tenant = await p.tenant.create({ data: { name: 'E2E-T', legal_name: 'E2E LLC', status: 'ACTIVE' } });
  const branch = await p.branch.create({ data: { tenant_id: tenant.id, name: 'E2E-B', status: 'ACTIVE' } });
  const user = await p.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'CL_ADMIN', name: 'E2E-U',
      email: `e2e-${randomUUID().slice(0, 8)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  const inspector = await p.inspector.create({
    data: {
      name: 'E2E Inspector', email: `e2e-insp-${randomUUID().slice(0, 8)}@test.local`, status: 'ACTIVE',
      base_lat: -33.8700, base_lng: 151.2000,
    },
  });
  seed.inspectorId = inspector.id;
  const serviceType = await p.serviceType.create({
    data: {
      code: `E2E-ST-${randomUUID().slice(0, 6)}`, name: 'Routine', flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: false, status: 'ACTIVE',
    },
  });

  const coords: Array<[number, number, string]> = [
    [-33.8836, 151.2108, 'Surry Hills'],
    [-33.8915, 151.2767, 'Bondi'],
    [-33.8980, 151.1793, 'Newtown'],
  ];
  for (const [lat, lng, suburb] of coords) {
    const property = await p.property.create({
      data: {
        tenant_id: tenant.id, branch_id: branch.id, property_code: `E2E-${randomUUID().slice(0, 6)}`,
        type: 'HOUSE', street: '12 King St', suburb, postcode: '2010', state: 'NSW', country: 'AU',
        lat, lng, geocoding_status: 'SUCCESS',
      },
    });
    await p.appointment.create({
      data: {
        tenant_id: tenant.id, branch_id: branch.id, property_id: property.id, service_type_id: serviceType.id,
        inspector_id: inspector.id, status: 'SCHEDULED', scheduled_date: new Date('2026-11-05'),
        time_slot_start: '08:00', time_slot_end: '17:00', price_amount: '100.00', payout_amount: '80.00',
        pricing_rule_snapshot_json: {}, rental_tenant_confirmation_status: 'CONFIRMED', created_by_user_id: user.id,
      },
    });
  }

  // The T-1 claim the publish gate requires (as if appointment.reject-unconfirmed ran at 19:00).
  await p.cronJobRun.create({
    data: { job_name: 'day-plan.publish', tenant_id: tenant.id, local_date: new Date('2026-11-04') },
  });
}, 120_000);

afterAll(async () => { await teardownDbHarness(harness); });

describe('day-plan publish E2E (real DB, stub router)', () => {
  it('publishes a 3-stop plan with geometry, a ROUTE_PUBLISHED notice and a delivery job', async () => {
    const p = harness.prisma;
    const reader = new PrismaDayPlanInputReader(p);
    const repo = new PrismaDayPlanRepository(p);
    const stub = new StubRoutingService();
    const planRoute = new PlanRouteService(stub, stub, silentLogger, metrics);
    const clock = { now: () => NOW };
    const compute = new ComputeDayPlanUseCase(reader, repo, planRoute, settingsStub, silentLogger, clock);
    const jobs = new CapturingJobQueue();
    const notices = new PublishSystemInspectorNoticeUseCase(
      p,
      new PrismaInspectorNoticeRepository(p),
      new PrismaInspectorDirectoryRepository(p),
      jobs,
      noopAudit,
      clock,
    );
    const publish = new PublishDayPlansUseCase(reader, repo, compute, notices, noopAudit, metrics, silentLogger, clock);

    const result = await publish.execute({ now: NOW, attempt: 1 });

    expect(result).toMatchObject({ due: 1, published: 1, notified: 1, continuation: false });

    const plan = await repo.findByInspectorAndDate(seed.inspectorId, '2026-11-05');
    expect(plan!.status).toBe('PUBLISHED');
    expect(plan!.publishedAt).not.toBeNull();
    expect(plan!.notifiedAt).not.toBeNull();
    expect(plan!.stops).toHaveLength(3);
    for (const s of plan!.stops) {
      expect(s.eta).not.toBeNull();
      expect(s.publishedEta).not.toBeNull();
    }
    expect(plan!.routeGeometry?.type).toBe('FeatureCollection');
    expect(plan!.routeGeometry!.features.length).toBeGreaterThan(0);
    expect(plan!.approximate).toBe(true);
    expect(plan!.approximateReason).toBe('NO_PROVIDER');

    const notice = await new PrismaInspectorNoticeRepository(p).findByDedupeKey(
      `route-published:${seed.inspectorId}:2026-11-05`,
    );
    expect(notice).not.toBeNull();

    expect(jobs.enqueued.some((j) => j.name === 'inspector-notice.deliver')).toBe(true);
  });
});
