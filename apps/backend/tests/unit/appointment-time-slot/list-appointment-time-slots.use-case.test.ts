import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAppointmentTimeSlotsUseCase } from '../../../src/modules/appointment-time-slot/application/use-cases/list-appointment-time-slots.use-case';
import type { IAppointmentTimeSlotRepository } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.repository';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';

/**
 * RBAC on the admin list endpoint — per spec 012 contracts line 56,
 * CL_USER and INSP are forbidden. CL_USER consumes time slots through
 * GET /v1/time-slots/effective (tested separately). See specs/DECISIONS.md
 * DEC-002.
 */
describe('ListAppointmentTimeSlotsUseCase — RBAC', () => {
  let repo: IAppointmentTimeSlotRepository;
  let useCase: ListAppointmentTimeSlotsUseCase;

  beforeEach(() => {
    repo = {
      findAll: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      findEffective: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as IAppointmentTimeSlotRepository;
    const authz = new AuthorizationService({ log: vi.fn() } as any);
    useCase = new ListAppointmentTimeSlotsUseCase(repo, authz);
  });

  function actor(role: AuthContext['role'], overrides: Partial<AuthContext> = {}): AuthContext {
    return {
      userId: 'user-1',
      tenantId: role === 'AM' || role === 'OP' ? null : 'tenant-1',
      role,
      branchId: null,
      inspectorId: null,
      ...overrides,
    };
  }

  it('allows AM with explicit tenantId', async () => {
    await expect(
      useCase.execute({ actor: actor('AM'), tenantId: 'tenant-1' }),
    ).resolves.not.toThrow();
  });

  it('allows OP with explicit tenantId', async () => {
    await expect(
      useCase.execute({ actor: actor('OP'), tenantId: 'tenant-1' }),
    ).resolves.not.toThrow();
  });

  it('allows CL_ADMIN pinned to own tenant', async () => {
    await expect(useCase.execute({ actor: actor('CL_ADMIN') })).resolves.not.toThrow();
    // Repo received the actor's tenantId, not a cross-tenant query
    expect((repo.findAll as any).mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-1' });
  });

  it('rejects CL_USER (manage page is admin-only; CL_USER uses /effective)', async () => {
    await expect(
      useCase.execute({ actor: actor('CL_USER') }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects INSP', async () => {
    await expect(
      useCase.execute({ actor: actor('INSP') }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
