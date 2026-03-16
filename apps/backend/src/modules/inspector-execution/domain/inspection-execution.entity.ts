import { BaseEntity } from '../../../shared/domain/entity';

export interface InspectionExecutionProps {
  id: string;
  appointmentId: string;
  inspectorId: string;
  startedAt: Date;
  finishedAt: Date | null;
  startLatitude: number;
  startLongitude: number;
  finishLatitude: number | null;
  finishLongitude: number | null;
  checklistJson: Record<string, unknown> | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class InspectionExecutionEntity extends BaseEntity {
  readonly appointmentId: string;
  readonly inspectorId: string;
  readonly startedAt: Date;
  finishedAt: Date | null;
  readonly startLatitude: number;
  readonly startLongitude: number;
  finishLatitude: number | null;
  finishLongitude: number | null;
  checklistJson: Record<string, unknown> | null;
  notes: string | null;

  constructor(props: InspectionExecutionProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.appointmentId = props.appointmentId;
    this.inspectorId = props.inspectorId;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt;
    this.startLatitude = props.startLatitude;
    this.startLongitude = props.startLongitude;
    this.finishLatitude = props.finishLatitude;
    this.finishLongitude = props.finishLongitude;
    this.checklistJson = props.checklistJson;
    this.notes = props.notes;
  }

  isFinished(): boolean {
    return this.finishedAt !== null;
  }

  isInProgress(): boolean {
    return this.finishedAt === null;
  }

  getStatus(): 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED' {
    // Note: NOT_STARTED is when no execution exists (external),
    // but for the entity itself, it's either IN_PROGRESS or FINISHED
    return this.finishedAt !== null ? 'FINISHED' : 'IN_PROGRESS';
  }
}
