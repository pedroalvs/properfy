import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeGroupScheduleUseCase } from '../../../src/modules/service-group/application/use-cases/change-group-schedule.use-case';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { PLATFORM_TIMEZONE, todayInTzDateString, type AuthContext } from '@properfy/shared';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { deriveTenantFixture } from '../../helpers/service-group-fixtures';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { SERVICE_GROUP_EVENTS } from '../../../src/shared/application/events/domain-event-bus';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  ServiceGroupDateInPastError,
  ServiceGroupTimeInPastError,
} from '../../../src/modules/service-group/domain/service-group.errors';

const FAR_FUTURE_DATE = '2030-06-15';

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appt-1',
    appointmentNumber: 1001,
    status: 'SCHEDULED',
    serviceTypeId: 'svc-type-1',
    tenantId: 'tenant-1',
    propertyId: 'property-1',
    serviceGroupId: 'group-1',
    scheduledDate: new Date('2030-06-01'),
    timeSlotStart: '10:00',
    timeSlotEnd: '11:00',
    rentalTenantConfirmationStatus: 'PENDING',
    activeConfirmationCycleId: null,
    propertyAddress: '10 Main St, Bondi',
    propertyCode: 'AG-PROP-0001',
    ...overrides,
  };
}

function makeGroupWith(
  groupOverrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
  members: Array<Record<string, unknown>> = [makeMember()],
): ServiceGroupWithAppointments {
  const group = new ServiceGroupEntity({
    id: 'group-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    status: 'PUBLISHED',
    groupSize: members.length,
    offeredCount: 0,
    confirmedCount: 0,
    scheduledDate: new Date('2030-06-01'),
    timeWindow: '09:00-17:00',
    assignedInspectorId: null,
    publishedAt: new Date('2026-01-01'),
    assignedAt: null,
    name: null,
    regionName: null,
    description: null,
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...groupOverrides,
  });
  return { group, appointments: members, ...deriveTenantFixture(members) } as unknown as ServiceGroupWithAppointments;
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
}

function setup(options: { group?: ServiceGroupWithAppointments | null; cached?: unknown } = {}) {
  const initial = options.group === undefined ? makeGroupWith() : options.group;
  const serviceGroupRepo = {
    findById: vi.fn().mockResolvedValue(initial),
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as IServiceGroupRepository;
  const appointmentRepo = { update: vi.fn().mockResolvedValue(undefined) };
  const auditService = { log: vi.fn() } as unknown as AuditService;
  const idempotencyService = {
    get: vi.fn().mockResolvedValue(options.cached ?? null),
    set: vi.fn().mockResolvedValue(undefined),
  };
  const sendGroupPortalLinks = { execute: vi.fn().mockResolvedValue({ results: [] }) };
  const confirmationCycleService = { realignActiveCycleSchedule: vi.fn().mockResolvedValue(undefined) };
  const onAdminRescheduleHandler = { execute: vi.fn().mockResolvedValue(undefined) };
  const eventBus = { emit: vi.fn() };
  const logger = { error: vi.fn() };

  const useCase = new ChangeGroupScheduleUseCase(
    serviceGroupRepo,
    appointmentRepo as never,
    auditService,
    new AuthorizationService(auditService),
    idempotencyService as never,
    sendGroupPortalLinks as never,
    confirmationCycleService as never,
    onAdminRescheduleHandler as never,
    eventBus as never,
    logger,
  );

  return {
    useCase, serviceGroupRepo, appointmentRepo, auditService, idempotencyService,
    sendGroupPortalLinks, confirmationCycleService, onAdminRescheduleHandler, eventBus, logger,
  };
}

const BASE = { groupId: 'group-1', confirmationStrategy: 'NOTIFY_ONLY' as const };

describe('ChangeGroupScheduleUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('authorization and gating', () => {
    it.each(['CL_ADMIN', 'CL_USER', 'INSP'] as const)('rejects %s actors', async (role) => {
      const { useCase } = setup();
      await expect(
        useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor({ role, tenantId: 'tenant-1' }) }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws when the group does not exist', async () => {
      const { useCase } = setup({ group: null });
      await expect(
        useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() }),
      ).rejects.toThrow(ServiceGroupNotFoundError);
    });

    it.each(['DRAFT', 'PUBLISHED', 'ACCEPTED'] as const)('allows %s groups', async (status) => {
      const { useCase } = setup({ group: makeGroupWith({ status }) });
      await expect(
        useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() }),
      ).resolves.toBeDefined();
    });

    it.each(['CANCELLED', 'REJECTED'] as const)('rejects %s groups', async (status) => {
      const { useCase } = setup({ group: makeGroupWith({ status }) });
      await expect(
        useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() }),
      ).rejects.toThrow(ServiceGroupInvalidStatusError);
    });
  });

  describe('validation happens before any write', () => {
    it('writes nothing when the new date is in the past', async () => {
      const { useCase, serviceGroupRepo, appointmentRepo, auditService } = setup();

      await expect(
        useCase.execute({ ...BASE, scheduledDate: '2020-01-01', actor: makeActor() }),
      ).rejects.toThrow(ServiceGroupDateInPastError);

      expect(serviceGroupRepo.update).not.toHaveBeenCalled();
      expect(appointmentRepo.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('writes nothing when today\'s new window has already elapsed', async () => {
      // A same-day group whose new start time is behind the clock: the time
      // branch of validateEditedSchedule, which the past-date case never reaches.
      //
      // The clock is pinned because the assertion needs "now" to be strictly
      // after the window. Reading the real clock made this fail whenever the
      // run landed inside the first minute of the day.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2030-06-15T02:00:00.000Z')); // 12:00 in Sydney
      try {
        const today = todayInTzDateString(PLATFORM_TIMEZONE);
        const { useCase, serviceGroupRepo, appointmentRepo, auditService } = setup({
          group: makeGroupWith({ scheduledDate: new Date(today) }),
        });

        await expect(
          useCase.execute({ ...BASE, scheduledDate: today, timeWindow: '09:00-10:00', actor: makeActor() }),
        ).rejects.toThrow(ServiceGroupTimeInPastError);

        expect(serviceGroupRepo.update).not.toHaveBeenCalled();
        expect(appointmentRepo.update).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('date-only change', () => {
    it('moves members to the new date without touching their time slots', async () => {
      const { useCase, appointmentRepo } = setup();

      await useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() });

      expect(appointmentRepo.update).toHaveBeenCalledTimes(1);
      const payload = appointmentRepo.update.mock.calls[0]![2];
      expect(payload).toHaveProperty('scheduledDate');
      expect(payload).not.toHaveProperty('timeSlotStart');
      expect(payload).not.toHaveProperty('timeSlotEnd');
    });

    it('reports the date move in the applied counts', async () => {
      const { useCase } = setup();

      const result = await useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() });

      expect(result.applied).toMatchObject({ total: 1, dateChanged: 1, slotClamped: 0, failed: 0 });
    });
  });

  describe('time window change', () => {
    it('clamps only the members that fall outside the new window', async () => {
      const { useCase, appointmentRepo } = setup({
        group: makeGroupWith({}, [
          makeMember({ id: 'inside', timeSlotStart: '13:00', timeSlotEnd: '14:00' }),
          makeMember({ id: 'outside', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
        ]),
      });

      const result = await useCase.execute({ ...BASE, timeWindow: '12:00-16:00', actor: makeActor() });

      expect(appointmentRepo.update).toHaveBeenCalledTimes(1);
      expect(appointmentRepo.update).toHaveBeenCalledWith(
        'outside',
        'tenant-1',
        expect.objectContaining({ timeSlotStart: '12:00', timeSlotEnd: '16:00' }),
      );
      expect(result.applied).toMatchObject({ slotClamped: 1, dateChanged: 0 });
    });

    it('leaves every member alone when the window only widens', async () => {
      const { useCase, appointmentRepo } = setup();

      const result = await useCase.execute({ ...BASE, timeWindow: '06:00-20:00', actor: makeActor() });

      expect(appointmentRepo.update).not.toHaveBeenCalled();
      expect(result.applied).toMatchObject({ slotClamped: 0, dateChanged: 0 });
    });

    it('keeps going when one member write fails', async () => {
      const { useCase, appointmentRepo, logger } = setup({
        group: makeGroupWith({}, [
          makeMember({ id: 'fails', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
          makeMember({ id: 'succeeds', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
        ]),
      });
      appointmentRepo.update.mockRejectedValueOnce(new Error('db down'));

      const result = await useCase.execute({ ...BASE, timeWindow: '12:00-16:00', actor: makeActor() });

      expect(appointmentRepo.update).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalled();
      expect(result.applied.failed).toBe(1);
    });
  });

  describe('terminal members', () => {
    it.each(['DONE', 'CANCELLED', 'REJECTED'] as const)('never moves a %s member', async (status) => {
      const { useCase, appointmentRepo } = setup({
        group: makeGroupWith({}, [makeMember({ status, timeSlotStart: '09:30', timeSlotEnd: '10:30' })]),
      });

      const result = await useCase.execute({ ...BASE, timeWindow: '12:00-15:00', actor: makeActor() });

      expect(appointmentRepo.update).not.toHaveBeenCalled();
      expect(result.applied).toMatchObject({ slotClamped: 0, dateChanged: 0 });
    });

    it('moves the live members of a group that also holds a completed one', async () => {
      const { useCase, appointmentRepo } = setup({
        group: makeGroupWith({}, [
          makeMember({ id: 'done', status: 'DONE', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
          makeMember({ id: 'live', status: 'SCHEDULED', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
        ]),
      });

      const result = await useCase.execute({ ...BASE, timeWindow: '12:00-15:00', actor: makeActor() });

      expect(appointmentRepo.update).toHaveBeenCalledTimes(1);
      expect(appointmentRepo.update).toHaveBeenCalledWith('live', 'tenant-1', expect.anything());
      expect(result.applied).toMatchObject({ total: 2, slotClamped: 1 });
    });

    it('never re-notifies the tenant of a completed inspection', async () => {
      const { useCase, onAdminRescheduleHandler } = setup({
        group: makeGroupWith({}, [
          makeMember({
            status: 'DONE',
            rentalTenantConfirmationStatus: 'CONFIRMED',
            activeConfirmationCycleId: 'cycle-1',
          }),
        ]),
      });

      await useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() });

      expect(onAdminRescheduleHandler.execute).not.toHaveBeenCalled();
    });
  });

  describe('tenant confirmations', () => {
    const confirmedMember = makeMember({
      rentalTenantConfirmationStatus: 'CONFIRMED',
      activeConfirmationCycleId: 'cycle-1',
    });

    it('RESEND scopes the portal-link send to the affected members only', async () => {
      const { useCase, sendGroupPortalLinks } = setup({
        group: makeGroupWith({}, [
          confirmedMember,
          makeMember({ id: 'untouched-pending', status: 'DRAFT', rentalTenantConfirmationStatus: 'PENDING' }),
        ]),
      });

      await useCase.execute({
        groupId: 'group-1',
        scheduledDate: FAR_FUTURE_DATE,
        confirmationStrategy: 'RESEND',
        actor: makeActor(),
      });

      expect(sendGroupPortalLinks.execute).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'group-1', appointmentIds: ['appt-1'] }),
      );
    });

    it('NOTIFY_ONLY realigns the cycle and never resends the link', async () => {
      const { useCase, sendGroupPortalLinks, confirmationCycleService, onAdminRescheduleHandler } = setup({
        group: makeGroupWith({}, [confirmedMember]),
      });

      await useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() });

      expect(sendGroupPortalLinks.execute).not.toHaveBeenCalled();
      expect(confirmationCycleService.realignActiveCycleSchedule).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.any(Date),
        '10:00-11:00',
      );
      expect(onAdminRescheduleHandler.execute).toHaveBeenCalledWith({ appointmentId: 'appt-1', tenantId: 'tenant-1' });
    });

    it('leaves a never-released member alone — nobody was told the old schedule', async () => {
      const { useCase, confirmationCycleService, onAdminRescheduleHandler } = setup({
        group: makeGroupWith({}, [
          makeMember({ status: 'DRAFT', rentalTenantConfirmationStatus: 'PENDING', activeConfirmationCycleId: null }),
        ]),
      });

      const result = await useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() });

      expect(confirmationCycleService.realignActiveCycleSchedule).not.toHaveBeenCalled();
      expect(onAdminRescheduleHandler.execute).not.toHaveBeenCalled();
      expect(result.applied.confirmationsHandled).toBe(0);
    });

    it('does not fail the request when the portal-link resend throws', async () => {
      const { useCase, sendGroupPortalLinks, auditService } = setup({
        group: makeGroupWith({}, [confirmedMember]),
      });
      sendGroupPortalLinks.execute.mockRejectedValueOnce(new Error('portal service down'));

      await expect(
        useCase.execute({
          groupId: 'group-1',
          scheduledDate: FAR_FUTURE_DATE,
          confirmationStrategy: 'RESEND',
          actor: makeActor(),
        }),
      ).resolves.toBeDefined();
      // The schedule is already written, so the change must still be recorded.
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'service_group.schedule_changed' }),
      );
    });

    it('does not fail the request when a notification throws', async () => {
      const { useCase, onAdminRescheduleHandler } = setup({ group: makeGroupWith({}, [confirmedMember]) });
      onAdminRescheduleHandler.execute.mockRejectedValueOnce(new Error('smtp down'));

      await expect(
        useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() }),
      ).resolves.toBeDefined();
    });
  });

  describe('audit and events', () => {
    it('records the operator confirmation choice', async () => {
      const { useCase, auditService } = setup();

      await useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'service_group.schedule_changed',
          entityId: 'group-1',
          metadata: expect.objectContaining({
            confirmationStrategy: 'NOTIFY_ONLY',
            initiatedBy: 'AM',
            groupStatus: 'PUBLISHED',
          }),
        }),
      );
    });

    it('emits SCHEDULE_CHANGED carrying the previous schedule for the inspector notice', async () => {
      const { useCase, eventBus } = setup({
        group: makeGroupWith({ status: 'ACCEPTED', assignedInspectorId: 'insp-1' }),
      });

      await useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() });

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SERVICE_GROUP_EVENTS.SCHEDULE_CHANGED,
          payload: expect.objectContaining({
            groupId: 'group-1',
            inspectorId: 'insp-1',
            previousTimeWindow: '09:00-17:00',
          }),
        }),
      );
    });
  });

  describe('idempotency', () => {
    it('replays a cached result without rewriting', async () => {
      const cached = { id: 'group-1', status: 'PUBLISHED', scheduledDate: FAR_FUTURE_DATE, timeWindow: '09:00-17:00', applied: { total: 0, dateChanged: 0, slotClamped: 0, failed: 0, confirmationsHandled: 0, confirmationStrategy: 'NOTIFY_ONLY' } };
      const { useCase, serviceGroupRepo } = setup({ cached });

      const result = await useCase.execute({ ...BASE, scheduledDate: FAR_FUTURE_DATE, actor: makeActor() });

      expect(result).toEqual(cached);
      expect(serviceGroupRepo.update).not.toHaveBeenCalled();
    });

    it('derives a key from the payload so a double submit cannot rotate cycles twice', async () => {
      const { useCase, idempotencyService } = setup();

      await useCase.execute({
        groupId: 'group-1',
        scheduledDate: FAR_FUTURE_DATE,
        confirmationStrategy: 'RESEND',
        actor: makeActor(),
      });

      expect(idempotencyService.get).toHaveBeenCalledWith(
        `group-schedule:group-1:${FAR_FUTURE_DATE}:09:00-17:00:RESEND`,
        'group-schedule',
      );
      expect(idempotencyService.set).toHaveBeenCalled();
    });
  });
});
