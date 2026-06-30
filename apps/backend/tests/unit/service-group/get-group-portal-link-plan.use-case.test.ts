import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetGroupPortalLinkPlanUseCase } from '../../../src/modules/service-group/application/use-cases/get-group-portal-link-plan.use-case';
import type {
  IServiceGroupRepository,
  GroupAppointmentConfirmationRow,
  ServiceGroupWithAppointments,
} from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';

const DATE_A = new Date('2026-07-01T00:00:00.000Z');
const DATE_B = new Date('2026-07-08T00:00:00.000Z');
const SLOT = '09:00-12:00';

function row(overrides: Partial<GroupAppointmentConfirmationRow>): GroupAppointmentConfirmationRow {
  return {
    id: 'appt-1',
    appointmentNumber: 1,
    tenantId: 'tenant-1',
    status: 'AWAITING_INSPECTOR',
    scheduledDate: DATE_A,
    timeSlot: SLOT,
    rentalTenantConfirmationStatus: 'PENDING',
    activeCycle: null,
    propertyCode: 'P-001',
    propertyAddress: '1 Main St, Sydney',
    ...overrides,
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
}

describe('GetGroupPortalLinkPlanUseCase', () => {
  let groupRepo: { findById: ReturnType<typeof vi.fn>; findGroupAppointmentsWithConfirmation: ReturnType<typeof vi.fn> };
  let useCase: GetGroupPortalLinkPlanUseCase;

  beforeEach(() => {
    groupRepo = {
      findById: vi.fn().mockResolvedValue({ primaryTenantId: 'tenant-1' } as unknown as ServiceGroupWithAppointments),
      findGroupAppointmentsWithConfirmation: vi.fn(),
    };
    const auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new GetGroupPortalLinkPlanUseCase(
      groupRepo as unknown as IServiceGroupRepository,
      authorizationService,
    );
  });

  it('classifies a mixed list and produces summary counts', async () => {
    groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([
      row({ id: 'a-send', rentalTenantConfirmationStatus: 'PENDING' }),
      row({ id: 'a-confirmed', rentalTenantConfirmationStatus: 'CONFIRMED', activeCycle: { scheduledDate: DATE_A, timeSlot: SLOT, status: 'CONFIRMED' } }),
      row({ id: 'a-stale', rentalTenantConfirmationStatus: 'CONFIRMED', scheduledDate: DATE_B, activeCycle: { scheduledDate: DATE_A, timeSlot: SLOT, status: 'CONFIRMED' } }),
      row({ id: 'a-draft', status: 'DRAFT' }),
    ]);

    const result = await useCase.execute({ groupId: 'group-1', actor: makeActor() });

    expect(result.summary).toEqual({
      total: 4,
      willSend: 1,
      willResendDateChanged: 1,
      alreadyConfirmed: 1,
      notSendable: 1,
    });
    expect(result.items.map((i) => i.plannedAction)).toEqual([
      'SEND',
      'SKIP_ALREADY_CONFIRMED',
      'SEND_AFTER_RESET',
      'SKIP_NOT_SENDABLE',
    ]);
    expect(result.items[0]).toMatchObject({ appointmentId: 'a-send', appointmentNumber: 1, propertyCode: 'P-001' });
  });

  it('rejects a CL role with ForbiddenError', async () => {
    await expect(
      useCase.execute({ groupId: 'group-1', actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(groupRepo.findGroupAppointmentsWithConfirmation).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the group does not exist', async () => {
    groupRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ groupId: 'missing', actor: makeActor() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('OP only sees its own tenant rows (cross-tenant group filtered)', async () => {
    groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([
      row({ id: 'mine', tenantId: 'tenant-1' }),
      row({ id: 'theirs', tenantId: 'tenant-2' }),
    ]);

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(result.items.map((i) => i.appointmentId)).toEqual(['mine']);
    expect(result.summary.total).toBe(1);
  });

  it('AM sees all rows of a cross-tenant group (no tenant filter)', async () => {
    groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([
      row({ id: 'tenant-1-appt', tenantId: 'tenant-1' }),
      row({ id: 'tenant-2-appt', tenantId: 'tenant-2' }),
    ]);

    const result = await useCase.execute({ groupId: 'group-1', actor: makeActor({ role: 'AM', tenantId: null }) });

    expect(result.items.map((i) => i.appointmentId)).toEqual(['tenant-1-appt', 'tenant-2-appt']);
    expect(result.summary.total).toBe(2);
  });
});
