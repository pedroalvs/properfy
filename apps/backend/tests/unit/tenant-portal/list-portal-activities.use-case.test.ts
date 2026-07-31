import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPortalActivitiesUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/list-portal-activities.use-case';
import { RentalTenantPortalActivityEntity } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-activity.entity';
import type { IRentalTenantPortalActivityRepository } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import { portalActivitiesResponseSchema, type AuthContext } from '@properfy/shared';

function createMockActivityRepo(): IRentalTenantPortalActivityRepository {
  return {
    save: vi.fn(),
    findLatestByTokenAndAction: vi.fn(),
    findByAppointmentId: vi.fn(),
  };
}

function createMockAppointmentRepo(): Pick<IAppointmentRepository, 'findById'> {
  return {
    findById: vi.fn(),
  };
}

function buildActivity(overrides: Partial<ConstructorParameters<typeof RentalTenantPortalActivityEntity>[0]> = {}): RentalTenantPortalActivityEntity {
  return new RentalTenantPortalActivityEntity({
    id: overrides.id ?? crypto.randomUUID(),
    appointmentId: overrides.appointmentId ?? 'appt-1',
    rentalTenantPortalTokenId: overrides.rentalTenantPortalTokenId ?? 'token-1',
    action: overrides.action ?? 'VIEW',
    previousValuesJson: overrides.previousValuesJson ?? null,
    newValuesJson: overrides.newValuesJson ?? null,
    ipAddress: overrides.ipAddress ?? '1.2.3.4',
    userAgent: overrides.userAgent ?? 'TestAgent',
    createdAt: overrides.createdAt ?? new Date('2026-04-01T10:00:00Z'),
  });
}

describe('ListPortalActivitiesUseCase', () => {
  let activityRepo: IRentalTenantPortalActivityRepository;
  let appointmentRepo: Pick<IAppointmentRepository, 'findById'>;
  let useCase: ListPortalActivitiesUseCase;

  const amActor: AuthContext = { userId: 'u1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
  const opActor: AuthContext = { userId: 'u2', tenantId: 't1', role: 'OP', branchId: null, inspectorId: null };
  const clAdminActor: AuthContext = { userId: 'u3', tenantId: 't1', role: 'CL_ADMIN', branchId: null, inspectorId: null };
  const inspActor: AuthContext = { userId: 'u4', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'i1' };

  beforeEach(() => {
    activityRepo = createMockActivityRepo();
    appointmentRepo = createMockAppointmentRepo();
    useCase = new ListPortalActivitiesUseCase(activityRepo, appointmentRepo as any);
  });

  it('should return paginated activities for AM actor', async () => {
    const activities = [buildActivity(), buildActivity({ action: 'CONFIRM' })];
    (appointmentRepo.findById as any).mockResolvedValue({ appointment: { id: 'appt-1', tenantId: 't1' } });
    (activityRepo.findByAppointmentId as any).mockResolvedValue({ activities, total: 2 });

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: amActor,
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
    expect(activityRepo.findByAppointmentId).toHaveBeenCalledWith('appt-1', 1, 20);
  });

  it('should return paginated activities for OP actor', async () => {
    const activities = [buildActivity()];
    (appointmentRepo.findById as any).mockResolvedValue({ appointment: { id: 'appt-1', tenantId: 't1' } });
    (activityRepo.findByAppointmentId as any).mockResolvedValue({ activities, total: 1 });

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: opActor,
      page: 1,
      pageSize: 10,
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', 't1');
  });

  it('should return paginated activities for CL_ADMIN actor', async () => {
    const activities = [buildActivity()];
    (appointmentRepo.findById as any).mockResolvedValue({ appointment: { id: 'appt-1', tenantId: 't1' } });
    (activityRepo.findByAppointmentId as any).mockResolvedValue({ activities, total: 1 });

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: clAdminActor,
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toHaveLength(1);
    // The lookup MUST carry the actor's tenant: it is the only thing keeping a
    // CL_ADMIN from reading another agency's portal history, since
    // findByAppointmentId below is not tenant-filtered.
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', 't1');
  });

  it('should not leak another tenant activities to CL_ADMIN', async () => {
    // Real repo behaviour: the row exists, but not within the actor's tenant
    // scope, so the scoped lookup resolves null.
    (appointmentRepo.findById as any).mockImplementation(async (_id: string, tenantId: string | null) =>
      tenantId === 'other-tenant' ? { appointment: { id: 'appt-1', tenantId: 'other-tenant' } } : null,
    );

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: clAdminActor, page: 1, pageSize: 20 }),
    ).rejects.toThrow('Appointment not found');

    expect(activityRepo.findByAppointmentId).not.toHaveBeenCalled();
  });

  it('should reject INSP actor with FORBIDDEN', async () => {
    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor, page: 1, pageSize: 20 }),
    ).rejects.toThrow('Only AM, OP and CL_ADMIN roles can view portal activities');
  });

  it('should throw NOT_FOUND when appointment does not exist', async () => {
    (appointmentRepo.findById as any).mockResolvedValue(null);

    await expect(
      useCase.execute({ appointmentId: 'non-existent', actor: amActor, page: 1, pageSize: 20 }),
    ).rejects.toThrow('Appointment not found');
  });

  it('should return empty data when no activities exist', async () => {
    (appointmentRepo.findById as any).mockResolvedValue({ appointment: { id: 'appt-1', tenantId: 't1' } });
    (activityRepo.findByAppointmentId as any).mockResolvedValue({ activities: [], total: 0 });

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: amActor,
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  /**
   * Contract guard: the route binds `portalActivitiesResponseSchema` as its 200 response,
   * and fastify-type-provider-zod hard-parses the payload AFTER the handler returns —
   * a mismatch surfaces as an opaque 500, never as a type error. Asserting the real
   * use-case output against the real schema pins the two together regardless of any
   * mock, which is what a field rename on only one side needs to trip over.
   */
  it('should emit a payload that satisfies the bound response schema', async () => {
    const activities = [
      buildActivity({
        id: '3f1a0b2c-0000-4000-8000-000000000001',
        appointmentId: '3f1a0b2c-0000-4000-8000-000000000002',
        rentalTenantPortalTokenId: '3f1a0b2c-0000-4000-8000-000000000003',
        action: 'GROUP_JOIN',
        newValuesJson: { scheduledDate: '2026-04-02', timeSlot: '09:00 - 12:00' },
      }),
    ];
    (appointmentRepo.findById as any).mockResolvedValue({ appointment: { id: 'appt-1', tenantId: 't1' } });
    (activityRepo.findByAppointmentId as any).mockResolvedValue({ activities, total: 1 });

    const result = await useCase.execute({
      appointmentId: '3f1a0b2c-0000-4000-8000-000000000002',
      actor: amActor,
      page: 1,
      pageSize: 20,
    });

    // Assert on the issues rather than the boolean, so a future drift reports which
    // field diverged instead of a bare "expected false to be true".
    const parsed = portalActivitiesResponseSchema.safeParse(result);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it('should serialize createdAt as ISO string', async () => {
    const date = new Date('2026-04-01T10:30:00Z');
    const activities = [buildActivity({ createdAt: date })];
    (appointmentRepo.findById as any).mockResolvedValue({ appointment: { id: 'appt-1', tenantId: 't1' } });
    (activityRepo.findByAppointmentId as any).mockResolvedValue({ activities, total: 1 });

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: amActor,
      page: 1,
      pageSize: 20,
    });

    expect(result.data[0]!.createdAt).toBe('2026-04-01T10:30:00.000Z');
  });
});
