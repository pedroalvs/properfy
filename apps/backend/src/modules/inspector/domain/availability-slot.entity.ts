import { BaseEntity } from '../../../shared/domain/entity';
import type { AvailabilitySlotStatus } from '@properfy/shared';

export interface AvailabilitySlotProps {
  id: string;
  inspectorId: string;
  date: Date;
  startTime: string;
  endTime: string;
  regionJson: Record<string, unknown> | null;
  capacity: number;
  status: AvailabilitySlotStatus;
  isOperatorOverride: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class AvailabilitySlotEntity extends BaseEntity {
  readonly inspectorId: string;
  readonly date: Date;
  readonly startTime: string;
  readonly endTime: string;
  readonly regionJson: Record<string, unknown> | null;
  readonly capacity: number;
  readonly isOperatorOverride: boolean;
  status: AvailabilitySlotStatus;

  constructor(props: AvailabilitySlotProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.inspectorId = props.inspectorId;
    this.date = props.date;
    this.startTime = props.startTime;
    this.endTime = props.endTime;
    this.regionJson = props.regionJson;
    this.capacity = props.capacity;
    this.isOperatorOverride = props.isOperatorOverride;
    this.status = props.status;
  }

  isAvailable(): boolean {
    return this.status === 'AVAILABLE';
  }

  overlaps(startTime: string, endTime: string): boolean {
    return this.startTime < endTime && this.endTime > startTime;
  }
}
