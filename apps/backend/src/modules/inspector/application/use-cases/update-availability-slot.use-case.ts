import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IAvailabilitySlotRepository } from '../../domain/availability-slot.repository';
import {
  AvailabilitySlotNotFoundError,
  AvailabilitySlotOverlapError,
} from '../../domain/inspector.errors';

export interface UpdateAvailabilitySlotInput {
  inspectorId: string;
  slotId: string;
  data: {
    date?: Date;
    startTime?: string;
    endTime?: string;
    regionJson?: Record<string, unknown> | null;
    capacity?: number;
    status?: string;
  };
  actor: AuthContext;
}

export interface UpdateAvailabilitySlotOutput {
  id: string;
  inspectorId: string;
  date: Date;
  startTime: string;
  endTime: string;
  regionJson: Record<string, unknown> | null;
  capacity: number;
  status: string;
  isOperatorOverride: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateAvailabilitySlotUseCase {
  constructor(
    private readonly slotRepo: IAvailabilitySlotRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateAvailabilitySlotInput): Promise<UpdateAvailabilitySlotOutput> {
    const { inspectorId, slotId, data, actor } = input;

    if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      if (inspectorId !== actor.inspectorId) {
        throw new ForbiddenError('FORBIDDEN', "Cannot access another inspector's data");
      }
    } else if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const slot = await this.slotRepo.findById(slotId, inspectorId);
    if (!slot) {
      throw new AvailabilitySlotNotFoundError();
    }

    // Operator-override slots are immutable to inspectors (027 merge rule 2 applies
    // to direct edits as well): only OP/AM may modify them.
    if (actor.role === 'INSP' && slot.isOperatorOverride) {
      throw new ForbiddenError('FORBIDDEN', 'Operator override slots can only be modified by operators');
    }

    // If time changes, check for overlaps (exclude self)
    const newStartTime = data.startTime ?? slot.startTime;
    const newEndTime = data.endTime ?? slot.endTime;
    const newDate = data.date ?? slot.date;

    if (data.startTime !== undefined || data.endTime !== undefined || data.date !== undefined) {
      const existingSlots = await this.slotRepo.findByDateRange(inspectorId, newDate, newStartTime, newEndTime);
      const hasOverlap = existingSlots.some((s) => s.id !== slotId && s.overlaps(newStartTime, newEndTime));
      if (hasOverlap) {
        throw new AvailabilitySlotOverlapError();
      }
    }

    const before = {
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      regionJson: slot.regionJson,
      capacity: slot.capacity,
      status: slot.status,
    };

    const updateData: Record<string, unknown> = {};
    if (data.date !== undefined) updateData.date = data.date;
    if (data.startTime !== undefined) updateData.startTime = data.startTime;
    if (data.endTime !== undefined) updateData.endTime = data.endTime;
    if (data.regionJson !== undefined) updateData.regionJson = data.regionJson;
    if (data.capacity !== undefined) updateData.capacity = data.capacity;
    if (data.status !== undefined) updateData.status = data.status;

    await this.slotRepo.update(slotId, inspectorId, updateData);

    const after = {
      date: (updateData.date as Date) ?? slot.date,
      startTime: (updateData.startTime as string) ?? slot.startTime,
      endTime: (updateData.endTime as string) ?? slot.endTime,
      regionJson: (updateData.regionJson as Record<string, unknown> | null) ?? slot.regionJson,
      capacity: (updateData.capacity as number) ?? slot.capacity,
      status: (updateData.status as string) ?? slot.status,
    };

    this.auditService.log({
      action: 'availability_slot.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'AvailabilitySlot',
      entityId: slotId,
      before,
      after,
    });

    return {
      id: slot.id,
      inspectorId: slot.inspectorId,
      date: after.date,
      startTime: after.startTime,
      endTime: after.endTime,
      regionJson: after.regionJson,
      capacity: after.capacity,
      status: after.status,
      isOperatorOverride: slot.isOperatorOverride,
      createdAt: slot.createdAt,
      updatedAt: new Date(),
    };
  }
}
