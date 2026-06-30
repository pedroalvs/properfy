import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPortalActivitiesUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/list-portal-activities.use-case';
import { RentalTenantPortalActivityEntity } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-activity.entity';
import type { IRentalTenantPortalActivityRepository } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuthContext } from '@properfy/shared';

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

  it('should reject CL_ADMIN actor with FORBIDDEN', async () => {
    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: clAdminActor, page: 1, pageSize: 20 }),
    ).rejects.toThrow('Only AM and OP roles can view portal activities');
  });

  it('should reject INSP actor with FORBIDDEN', async () => {
    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor, page: 1, pageSize: 20 }),
    ).rejects.toThrow('Only AM and OP roles can view portal activities');
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
