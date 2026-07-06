import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IAvailabilitySlotRepository } from '../../domain/availability-slot.repository';
import { AvailabilitySlotEntity } from '../../domain/availability-slot.entity';
import { InspectorNotFoundError, AvailabilitySlotOverlapError } from '../../domain/inspector.errors';

export interface CreateAvailabilitySlotInput {
  inspectorId: string;
  date: Date;
  startTime: string;
  endTime: string;
  regionJson?: Record<string, unknown> | null;
  capacity?: number;
  actor: AuthContext;
}

export interface CreateAvailabilitySlotOutput {
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
}

export class CreateAvailabilitySlotUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly slotRepo: IAvailabilitySlotRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateAvailabilitySlotInput): Promise<CreateAvailabilitySlotOutput> {
    const { inspectorId, date, startTime, endTime, regionJson, capacity, actor } = input;

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

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    // Check for overlapping slots on same date
    const existingSlots = await this.slotRepo.findByDateRange(inspectorId, date, startTime, endTime);
    const hasOverlap = existingSlots.some((slot) => slot.overlaps(startTime, endTime));
    if (hasOverlap) {
      throw new AvailabilitySlotOverlapError();
    }

    const now = new Date();
    const id = crypto.randomUUID();

    const slot = new AvailabilitySlotEntity({
      id,
      inspectorId,
      date,
      startTime,
      endTime,
      regionJson: regionJson ?? null,
      capacity: capacity ?? 1,
      status: 'AVAILABLE',
      isOperatorOverride: actor.role === 'OP' || actor.role === 'AM',
      createdAt: now,
      updatedAt: now,
    });

    await this.slotRepo.save(slot);

    this.auditService.log({
      action: 'availability_slot.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'AvailabilitySlot',
      entityId: id,
      after: {
        id,
        inspectorId,
        date,
        startTime,
        endTime,
        regionJson: slot.regionJson,
        capacity: slot.capacity,
        status: 'AVAILABLE',
      },
    });

    return {
      id: slot.id,
      inspectorId: slot.inspectorId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      regionJson: slot.regionJson,
      capacity: slot.capacity,
      status: slot.status,
      isOperatorOverride: slot.isOperatorOverride,
      createdAt: slot.createdAt,
    };
  }
}
