import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAppointmentFlowTypeReader } from '../../../src/modules/notification/infrastructure/prisma-appointment-flow-type.reader';

function makePrisma(result: unknown) {
  const findFirst = vi.fn().mockResolvedValue(result);
  return {
    prisma: { appointment: { findFirst } } as unknown as PrismaClient,
    findFirst,
  };
}

describe('createAppointmentFlowTypeReader', () => {
  it('returns the flow type of the appointment service type, scoped by tenant', async () => {
    const { prisma, findFirst } = makePrisma({ service_type: { flow_type: 'INGOING' } });

    const flowType = await createAppointmentFlowTypeReader(prisma)('appt-1', 'tenant-1');

    expect(flowType).toBe('INGOING');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'appt-1', tenant_id: 'tenant-1' },
      select: { service_type: { select: { flow_type: true } } },
    });
  });

  // Multi-tenant rule (backend CLAUDE.md §5): no business query without tenant
  // scope. An id-only lookup would let one agency's flow type decide whether
  // another agency's notification is withheld.
  it('never queries without a tenant scope', async () => {
    const { prisma, findFirst } = makePrisma({ service_type: { flow_type: 'INGOING' } });

    await createAppointmentFlowTypeReader(prisma)('appt-1', 'tenant-1');

    const where = findFirst.mock.calls[0][0].where;
    expect(where).toHaveProperty('tenant_id', 'tenant-1');
  });

  // Platform-scoped notifications (password reset, report ready) carry no tenant.
  // Returning null keeps them notifying rather than suppressing them by accident.
  it('returns null for a platform-scoped notification instead of querying', async () => {
    const { prisma, findFirst } = makePrisma({ service_type: { flow_type: 'INGOING' } });

    expect(await createAppointmentFlowTypeReader(prisma)('appt-1', null)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  // Fail open. A password reset or report-ready notification carries no
  // appointment; querying with a null id would throw in Prisma, and treating the
  // absence as "suppressed" would silence mail that has nothing to do with
  // occupants.
  it.each([null, undefined, ''])('returns null without querying for the id %p', async (id) => {
    const { prisma, findFirst } = makePrisma(null);

    const flowType = await createAppointmentFlowTypeReader(prisma)(
      id as string | null | undefined,
      'tenant-1',
    );

    expect(flowType).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('returns null when the appointment no longer exists', async () => {
    const { prisma } = makePrisma(null);

    expect(await createAppointmentFlowTypeReader(prisma)('gone', 'tenant-1')).toBeNull();
  });

  it('returns null when the appointment has no service type relation', async () => {
    const { prisma } = makePrisma({ service_type: null });

    expect(await createAppointmentFlowTypeReader(prisma)('appt-1', 'tenant-1')).toBeNull();
  });
});
