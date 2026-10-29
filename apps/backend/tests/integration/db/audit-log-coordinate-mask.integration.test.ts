/**
 * Audit-log coordinate masking for CL_ADMIN — real database (F03-1, D10).
 *
 * A legacy `inspection.started` audit stores the inspector's raw coordinates.
 * Reading `/v1/audit-logs` as a CL_ADMIN must return them masked, while AM/OP
 * see them intact. Proven through the real repository + ListAuditLogsUseCase.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { PrismaAuditLogRepository } from '../../../src/modules/audit/infrastructure/prisma-audit-log.repository';
import { ListAuditLogsUseCase } from '../../../src/modules/audit/application/use-cases/list-audit-logs.use-case';

describe('Audit-log coordinate masking for CL_ADMIN (real DB)', () => {
  let harness: DbHarness;
  let tenantId: string;
  let appointmentId: string;

  beforeAll(async () => {
    harness = await setupDbHarness();
    const fixture = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Mask Tenant' });
    tenantId = fixture.tenantId;
    appointmentId = fixture.appointmentId;

    await harness.prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        actor_type: 'USER',
        actor_id: null,
        entity_type: 'Appointment',
        entity_id: appointmentId,
        action: 'inspection.started',
        metadata_json: { latitude: -33.8688, longitude: 151.2093, geolocationDistanceMeters: 120 },
      },
    });
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function useCase() {
    return new ListAuditLogsUseCase(new PrismaAuditLogRepository(harness.prisma));
  }

  const read = (actor: AuthContext) =>
    useCase().execute({ filters: { entityId: appointmentId }, pagination: { page: 1, pageSize: 20, sortOrder: 'desc' }, actor });

  it('returns no inspector coordinates to a CL_ADMIN of the tenant', async () => {
    const result = await read({ userId: 'cl-1', tenantId, role: 'CL_ADMIN', branchId: null, inspectorId: null });
    const started = result.data.find((e) => e.action === 'inspection.started');
    expect(started).toBeDefined();
    const meta = started!.metadataJson as Record<string, unknown>;
    expect(meta.latitude).toBe('[MASKED]');
    expect(meta.longitude).toBe('[MASKED]');
    expect(meta.geolocationDistanceMeters).toBe(120);
  });

  it('returns the coordinates intact to an AM', async () => {
    const result = await read({ userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null });
    const started = result.data.find((e) => e.action === 'inspection.started');
    expect(started).toBeDefined();
    const meta = started!.metadataJson as Record<string, unknown>;
    expect(meta.latitude).toBe(-33.8688);
    expect(meta.longitude).toBe(151.2093);
  });
});
