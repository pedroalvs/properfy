import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForceConfirmGroupUseCase } from '../../../src/modules/service-group/application/use-cases/force-confirm-group.use-case';
import { ServiceGroupNotFoundError } from '../../../src/modules/service-group/domain/service-group.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';

type Member = {
  id: string;
  appointmentNumber: number;
  status: string;
  serviceTypeId: string;
  tenantId: string;
  propertyId: string;
  serviceGroupId: string | null;
  scheduledDate: Date;
  timeSlotStart: string;
  timeSlotEnd: string;
  rentalTenantConfirmationStatus: string;
  activeConfirmationCycleId: string | null;
  propertyAddress: string | null;
  propertyCode: string | null;
};

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'appt-1',
    appointmentNumber: 1,
    status: 'SCHEDULED',
    serviceTypeId: 'st-1',
    tenantId: 'tenant-1',
    propertyId: 'prop-1',
    serviceGroupId: 'group-1',
    scheduledDate: new Date('2026-04-01'),
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    rentalTenantConfirmationStatus: 'PENDING',
    activeConfirmationCycleId: 'cycle-1',
    propertyAddress: '1 Test St',
    propertyCode: 'P1',
    ...overrides,
  };
}

function makeGroupResult(members: Member[]) {
  return {
    group: { id: 'group-1', status: 'ACCEPTED' },
    assignedInspectorName: null,
    tenantIds: [...new Set(members.map((m) => m.tenantId))],
    primaryTenantId: members.length > 0 ? members[0]!.tenantId : null,
    agencies: [],
    appointments: members,
  };
}

function makeActor(role: AuthContext['role'], overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'actor-1',
    tenantId: role === 'AM' || role === 'OP' ? null : 'tenant-1',
    role,
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

const serviceGroupRepo = { findById: vi.fn() };
const appointmentRepo = { update: vi.fn() };
const auditService = { log: vi.fn() };
const cycleService = { confirm: vi.fn() };

function makeUseCase(withCycle = true) {
  return new ForceConfirmGroupUseCase(
    serviceGroupRepo as any,
    appointmentRepo as any,
    auditService as any,
    new AuthorizationService(auditService as any),
    withCycle ? (cycleService as any) : undefined,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  appointmentRepo.update.mockResolvedValue(undefined);
  cycleService.confirm.mockResolvedValue(undefined);
});

describe('ForceConfirmGroupUseCase — happy path', () => {
  it('confirms every unconfirmed non-terminal member and skips the rest', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      makeGroupResult([
        makeMember({ id: 'a', rentalTenantConfirmationStatus: 'PENDING' }),
        makeMember({ id: 'b', rentalTenantConfirmationStatus: 'NO_RESPONSE' }),
        makeMember({ id: 'c', rentalTenantConfirmationStatus: 'CONFIRMED' }), // skip
        makeMember({ id: 'd', status: 'DONE', rentalTenantConfirmationStatus: 'PENDING' }), // skip terminal
      ]),
    );

    const result = await makeUseCase().execute({ groupId: 'group-1', actor: makeActor('AM') });

    expect(result).toEqual({ groupId: 'group-1', confirmedCount: 2, skippedCount: 2 });
    expect(cycleService.confirm).toHaveBeenCalledTimes(2);
    expect(cycleService.confirm).toHaveBeenCalledWith('a', 'tenant-1', 'OPERATOR_FORCED', null);
    expect(cycleService.confirm).toHaveBeenCalledWith('b', 'tenant-1', 'OPERATOR_FORCED', null);
    expect(auditService.log).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.force_manual_confirmation',
        entityId: 'a',
        after: { rentalTenantConfirmationStatus: 'CONFIRMED' },
        metadata: { trigger: 'group_force_confirmation', groupId: 'group-1' },
      }),
    );
  });

  it('is idempotent — a group already fully confirmed confirms nothing', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      makeGroupResult([
        makeMember({ id: 'a', rentalTenantConfirmationStatus: 'CONFIRMED' }),
        makeMember({ id: 'b', rentalTenantConfirmationStatus: 'CONFIRMED' }),
      ]),
    );

    const result = await makeUseCase().execute({ groupId: 'group-1', actor: makeActor('OP') });

    expect(result).toEqual({ groupId: 'group-1', confirmedCount: 0, skippedCount: 2 });
    expect(cycleService.confirm).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('falls back to a direct denorm write when there is no active cycle', async () => {
    cycleService.confirm.mockRejectedValue(new Error('no active cycle'));
    serviceGroupRepo.findById.mockResolvedValue(
      makeGroupResult([makeMember({ id: 'a', rentalTenantConfirmationStatus: 'PENDING' })]),
    );

    const result = await makeUseCase().execute({ groupId: 'group-1', actor: makeActor('AM') });

    expect(result.confirmedCount).toBe(1);
    expect(appointmentRepo.update).toHaveBeenCalledWith('a', 'tenant-1', {
      rentalTenantConfirmationStatus: 'CONFIRMED',
    });
  });

  it('writes directly when no cycle service is wired', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      makeGroupResult([makeMember({ id: 'a', rentalTenantConfirmationStatus: 'PENDING' })]),
    );

    const result = await makeUseCase(false).execute({ groupId: 'group-1', actor: makeActor('AM') });

    expect(result.confirmedCount).toBe(1);
    expect(appointmentRepo.update).toHaveBeenCalledWith('a', 'tenant-1', {
      rentalTenantConfirmationStatus: 'CONFIRMED',
    });
  });
});

describe('ForceConfirmGroupUseCase — tenant scoping', () => {
  it('CL_ADMIN confirms only its own agency members in a cross-tenant group', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      makeGroupResult([
        makeMember({ id: 'mine', tenantId: 'tenant-1', rentalTenantConfirmationStatus: 'PENDING' }),
        makeMember({ id: 'theirs', tenantId: 'tenant-2', rentalTenantConfirmationStatus: 'PENDING' }),
      ]),
    );

    const result = await makeUseCase().execute({
      groupId: 'group-1',
      actor: makeActor('CL_ADMIN', { tenantId: 'tenant-1' }),
    });

    expect(result).toEqual({ groupId: 'group-1', confirmedCount: 1, skippedCount: 1 });
    expect(cycleService.confirm).toHaveBeenCalledTimes(1);
    expect(cycleService.confirm).toHaveBeenCalledWith('mine', 'tenant-1', 'OPERATOR_FORCED', null);
    // CL_* is read tenant-pinned.
    expect(serviceGroupRepo.findById).toHaveBeenCalledWith('group-1', 'tenant-1');
  });

  it('AM reads the group platform-wide (no tenant predicate)', async () => {
    serviceGroupRepo.findById.mockResolvedValue(makeGroupResult([makeMember()]));
    await makeUseCase().execute({ groupId: 'group-1', actor: makeActor('AM') });
    expect(serviceGroupRepo.findById).toHaveBeenCalledWith('group-1', null);
  });

  it('throws ServiceGroupNotFoundError when the group is missing', async () => {
    serviceGroupRepo.findById.mockResolvedValue(null);
    await expect(
      makeUseCase().execute({ groupId: 'missing', actor: makeActor('AM') }),
    ).rejects.toThrow(ServiceGroupNotFoundError);
  });
});

describe('ForceConfirmGroupUseCase — RBAC', () => {
  it.each([['INSP' as const], ['TNT' as const]])('%s is forbidden', async (role) => {
    await expect(
      makeUseCase().execute({ groupId: 'group-1', actor: makeActor(role) }),
    ).rejects.toThrow(ForbiddenError);
    expect(serviceGroupRepo.findById).not.toHaveBeenCalled();
  });

  it('CL_USER without force_confirmation is forbidden', async () => {
    await expect(
      makeUseCase().execute({ groupId: 'group-1', actor: makeActor('CL_USER') }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('CL_USER with force_confirmation can force-confirm', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      makeGroupResult([makeMember({ id: 'a', rentalTenantConfirmationStatus: 'PENDING' })]),
    );
    const result = await makeUseCase().execute({
      groupId: 'group-1',
      actor: makeActor('CL_USER', { tenantId: 'tenant-1', clUserPermissions: ['force_confirmation'] }),
    });
    expect(result.confirmedCount).toBe(1);
  });
});
