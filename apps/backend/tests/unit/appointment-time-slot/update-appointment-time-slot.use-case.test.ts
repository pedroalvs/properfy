import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { IAppointmentTimeSlotRepository } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.repository';
import { AppointmentTimeSlotEntity } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.entity';
import { UpdateAppointmentTimeSlotUseCase } from '../../../src/modules/appointment-time-slot/application/use-cases/update-appointment-time-slot.use-case';
import { ValidationError } from '../../../src/shared/domain/errors';

function makeSlot(
  overrides: Partial<ConstructorParameters<typeof AppointmentTimeSlotEntity>[0]> = {},
) {
  return new AppointmentTimeSlotEntity({
    id: 'slot-1',
    tenantId: 'tenant-1',
    branchId: null,
    label: 'Morning',
    startTime: '08:00',
    endTime: '12:00',
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  });
}

describe('UpdateAppointmentTimeSlotUseCase', () => {
  let timeSlotRepo: IAppointmentTimeSlotRepository;
  let auditService: AuditService;
  let useCase: UpdateAppointmentTimeSlotUseCase;

  const amActor: AuthContext = {
    userId: 'admin-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };

  beforeEach(() => {
    timeSlotRepo = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      findEffective: vi.fn(),
      softDelete: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateAppointmentTimeSlotUseCase(timeSlotRepo, auditService);
  });

  it('rejects invalid time ranges when both values are supplied', async () => {
    vi.mocked(timeSlotRepo.findById).mockResolvedValue(makeSlot());

    await expect(
      useCase.execute({
        timeSlotId: 'slot-1',
        data: { startTime: '17:00', endTime: '09:00' },
        actor: amActor,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects invalid time ranges when a partial update makes the range invalid', async () => {
    vi.mocked(timeSlotRepo.findById).mockResolvedValue(
      makeSlot({ startTime: '10:00', endTime: '18:00' }),
    );

    await expect(
      useCase.execute({
        timeSlotId: 'slot-1',
        data: { endTime: '09:00' },
        actor: amActor,
      }),
    ).rejects.toThrow(ValidationError);
  });
});
