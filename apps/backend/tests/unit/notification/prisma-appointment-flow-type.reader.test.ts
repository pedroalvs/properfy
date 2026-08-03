import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAppointmentFlowTypeReader } from '../../../src/modules/notification/infrastructure/prisma-appointment-flow-type.reader';

function makePrisma(result: unknown) {
  const findUnique = vi.fn().mockResolvedValue(result);
  return {
    prisma: { appointment: { findUnique } } as unknown as PrismaClient,
    findUnique,
  };
}

describe('createAppointmentFlowTypeReader', () => {
  it('returns the flow type of the appointment service type', async () => {
    const { prisma, findUnique } = makePrisma({ service_type: { flow_type: 'INGOING' } });

    const flowType = await createAppointmentFlowTypeReader(prisma)('appt-1');

    expect(flowType).toBe('INGOING');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'appt-1' },
      select: { service_type: { select: { flow_type: true } } },
    });
  });

  // Fail open. A password reset or report-ready notification carries no
  // appointment; querying with a null id would throw in Prisma, and treating the
  // absence as "suppressed" would silence mail that has nothing to do with
  // occupants.
  it.each([null, undefined, ''])('returns null without querying for the id %p', async (id) => {
    const { prisma, findUnique } = makePrisma(null);

    const flowType = await createAppointmentFlowTypeReader(prisma)(id as string | null | undefined);

    expect(flowType).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns null when the appointment no longer exists', async () => {
    const { prisma } = makePrisma(null);

    expect(await createAppointmentFlowTypeReader(prisma)('gone')).toBeNull();
  });

  it('returns null when the appointment has no service type relation', async () => {
    const { prisma } = makePrisma({ service_type: null });

    expect(await createAppointmentFlowTypeReader(prisma)('appt-1')).toBeNull();
  });
});
