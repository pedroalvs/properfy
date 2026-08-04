import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAppointmentSuburbsUseCase } from '../../../src/modules/appointment/application/use-cases/list-appointment-suburbs.use-case';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('ListAppointmentSuburbsUseCase', () => {
  let appointmentRepo: Pick<IAppointmentRepository, 'findDistinctSuburbs'>;
  let useCase: ListAppointmentSuburbsUseCase;

  beforeEach(() => {
    appointmentRepo = { findDistinctSuburbs: vi.fn().mockResolvedValue([]) };
    const authorizationService = new AuthorizationService({ log: vi.fn() } as any);
    useCase = new ListAppointmentSuburbsUseCase(
      appointmentRepo as IAppointmentRepository,
      authorizationService,
    );
  });

  it('returns the suburbs the repository reports', async () => {
    vi.mocked(appointmentRepo.findDistinctSuburbs).mockResolvedValue(['Bondi', 'Newtown']);

    const result = await useCase.execute({ actor: makeActor({ role: 'AM' }) });

    expect(result).toEqual({ suburbs: ['Bondi', 'Newtown'] });
  });

  it('lets AM query every tenant when no tenantId is given', async () => {
    await useCase.execute({ actor: makeActor({ role: 'AM' }) });

    expect(appointmentRepo.findDistinctSuburbs).toHaveBeenCalledWith(undefined);
  });

  it('lets OP narrow to a tenant via the query param', async () => {
    await useCase.execute({ tenantId: 'tenant-9', actor: makeActor({ role: 'OP' }) });

    expect(appointmentRepo.findDistinctSuburbs).toHaveBeenCalledWith('tenant-9');
  });

  // Cross-tenant denial: the query param must never widen a tenant-scoped role.
  it('pins CL_ADMIN to its own tenant and ignores a foreign tenantId', async () => {
    await useCase.execute({
      tenantId: 'other-tenant',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(appointmentRepo.findDistinctSuburbs).toHaveBeenCalledWith('tenant-1');
  });

  it('pins CL_USER to its own tenant and ignores a foreign tenantId', async () => {
    await useCase.execute({
      tenantId: 'other-tenant',
      actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-2' }),
    });

    expect(appointmentRepo.findDistinctSuburbs).toHaveBeenCalledWith('tenant-2');
  });

  // Fail closed: `buildWhere` applies tenant_id behind a truthiness check, so
  // returning undefined here would drop the predicate entirely and hand a
  // tenant-pinned actor every agency's suburbs.
  it('refuses a tenant-pinned actor carrying no tenant instead of querying unscoped', async () => {
    await expect(
      useCase.execute({ actor: makeActor({ role: 'CL_ADMIN', tenantId: null }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(appointmentRepo.findDistinctSuburbs).not.toHaveBeenCalled();
  });

  it('rejects INSP', async () => {
    await expect(
      useCase.execute({ actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(appointmentRepo.findDistinctSuburbs).not.toHaveBeenCalled();
  });
});
