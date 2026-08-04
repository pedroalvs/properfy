import type { AuthContext, InspectorWorkloadResponse } from '@properfy/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetInspectorWorkloadUseCase } from '../../../src/modules/dashboard/application/use-cases/get-inspector-workload.use-case';
import type { InspectorWorkloadRepository } from '../../../src/modules/dashboard/domain/inspector-workload.repository';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function actorWith(role: string, tenantId: string | null = null): AuthContext {
  return { userId: 'user-1', role, tenantId, email: 'a@b.com' } as unknown as AuthContext;
}

describe('GetInspectorWorkloadUseCase', () => {
  let repository: { getWorkload: ReturnType<typeof vi.fn> };
  let useCase: GetInspectorWorkloadUseCase;

  beforeEach(() => {
    repository = { getWorkload: vi.fn().mockResolvedValue({} as InspectorWorkloadResponse) };
    useCase = new GetInspectorWorkloadUseCase(repository as unknown as InspectorWorkloadRepository);
  });

  describe('authorization', () => {
    it.each(['AM', 'OP'])('allows %s', async (role) => {
      await expect(useCase.execute({ actor: actorWith(role), query: {} })).resolves.toBeDefined();
      expect(repository.getWorkload).toHaveBeenCalledTimes(1);
    });

    it.each(['CL_ADMIN', 'CL_USER', 'INSP', 'TNT'])('denies %s', async (role) => {
      await expect(
        useCase.execute({ actor: actorWith(role, 'tenant-1'), query: {} }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.getWorkload).not.toHaveBeenCalled();
    });

    it('denies an agency role even when it carries the view_financials flag', async () => {
      const actor = {
        ...actorWith('CL_USER', 'tenant-1'),
        clUserPermissions: ['view_financials'],
      } as unknown as AuthContext;

      await expect(useCase.execute({ actor, query: {} })).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('week resolution', () => {
    it('passes an explicit weekStart straight through', async () => {
      await useCase.execute({ actor: actorWith('AM'), query: { weekStart: '2026-07-27' } });
      expect(repository.getWorkload).toHaveBeenCalledWith({ weekStart: '2026-07-27' });
    });

    it('defaults to the Monday of the current week', async () => {
      // 2026-07-30T02:00Z is Thursday 30 Jul in Sydney.
      await useCase.execute({
        actor: actorWith('OP'),
        query: {},
        now: new Date('2026-07-30T02:00:00.000Z'),
      });
      expect(repository.getWorkload).toHaveBeenCalledWith({ weekStart: '2026-07-27' });
    });

    /**
     * The two cases that separate a Sydney-anchored clock from a UTC or
     * server-local one. Sydney is UTC+10/+11, so late-UTC-Sunday is already
     * Monday in Sydney — and the week must roll forward with it.
     */
    it('resolves the Sydney week when UTC is still on the previous day', async () => {
      // Sunday 2026-07-26 23:00Z is Monday 2026-07-27 09:00 in Sydney.
      await useCase.execute({
        actor: actorWith('AM'),
        query: {},
        now: new Date('2026-07-26T23:00:00.000Z'),
      });
      expect(repository.getWorkload).toHaveBeenCalledWith({ weekStart: '2026-07-27' });
    });

    it('does not roll forward before Sydney midnight', async () => {
      // Sunday 2026-07-26 12:00Z is still Sunday 22:00 in Sydney.
      await useCase.execute({
        actor: actorWith('AM'),
        query: {},
        now: new Date('2026-07-26T12:00:00.000Z'),
      });
      expect(repository.getWorkload).toHaveBeenCalledWith({ weekStart: '2026-07-20' });
    });
  });
});
