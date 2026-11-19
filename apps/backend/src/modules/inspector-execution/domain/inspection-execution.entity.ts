import { BaseEntity } from '../../../shared/domain/entity';

export interface InspectionExecutionProps {
  id: string;
  appointmentId: string;
  inspectorId: string;
  startedAt: Date;
  finishedAt: Date | null;
  resumedAt: Date | null;
  startLatitude: number;
  startLongitude: number;
  finishLatitude: number | null;
  finishLongitude: number | null;
  geolocationDistanceMeters: number | null;
  createdAt: Date;
  updatedAt: Date;
  // F03 capture + geofence fields (optional; default null/false for pre-F03 rows).
  startAccuracyMeters?: number | null;
  finishAccuracyMeters?: number | null;
  startClientAt?: Date | null;
  finishClientAt?: Date | null;
  finishGeolocationDistanceMeters?: number | null;
  outOfRadius?: boolean;
  outOfWindow?: boolean;
  finishOutOfRadius?: boolean;
  geofenceRadiusMeters?: number | null;
  /** Set when a check-in was abandoned (inspector reported can't-do after check-in). */
  abandonedAt?: Date | null;
}

export class InspectionExecutionEntity extends BaseEntity {
  readonly appointmentId: string;
  readonly inspectorId: string;
  readonly startedAt: Date;
  finishedAt: Date | null;
  resumedAt: Date | null;
  readonly startLatitude: number;
  readonly startLongitude: number;
  finishLatitude: number | null;
  finishLongitude: number | null;
  readonly geolocationDistanceMeters: number | null;
  readonly startAccuracyMeters: number | null;
  finishAccuracyMeters: number | null;
  readonly startClientAt: Date | null;
  finishClientAt: Date | null;
  finishGeolocationDistanceMeters: number | null;
  readonly outOfRadius: boolean;
  readonly outOfWindow: boolean;
  finishOutOfRadius: boolean;
  /** Snapshot of the applied radius at check-in; null only for pre-F03 rows. */
  readonly geofenceRadiusMeters: number | null;
  readonly abandonedAt: Date | null;

  constructor(props: InspectionExecutionProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.appointmentId = props.appointmentId;
    this.inspectorId = props.inspectorId;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt;
    this.resumedAt = props.resumedAt;
    this.startLatitude = props.startLatitude;
    this.startLongitude = props.startLongitude;
    this.finishLatitude = props.finishLatitude;
    this.finishLongitude = props.finishLongitude;
    this.geolocationDistanceMeters = props.geolocationDistanceMeters;
    this.startAccuracyMeters = props.startAccuracyMeters ?? null;
    this.finishAccuracyMeters = props.finishAccuracyMeters ?? null;
    this.startClientAt = props.startClientAt ?? null;
    this.finishClientAt = props.finishClientAt ?? null;
    this.finishGeolocationDistanceMeters = props.finishGeolocationDistanceMeters ?? null;
    this.outOfRadius = props.outOfRadius ?? false;
    this.outOfWindow = props.outOfWindow ?? false;
    this.finishOutOfRadius = props.finishOutOfRadius ?? false;
    this.geofenceRadiusMeters = props.geofenceRadiusMeters ?? null;
    this.abandonedAt = props.abandonedAt ?? null;
  }

  isFinished(): boolean {
    return this.finishedAt !== null;
  }

  /** A check-in abandoned by a post-check-in "Can't do this job"; treated as not started. */
  isAbandoned(): boolean {
    return this.abandonedAt !== null;
  }

  isInProgress(): boolean {
    return this.finishedAt === null && this.abandonedAt === null;
  }

  getStatus(): 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED' {
    // Note: NOT_STARTED is when no execution exists (external),
    // but for the entity itself, it's either IN_PROGRESS or FINISHED
    return this.finishedAt !== null ? 'FINISHED' : 'IN_PROGRESS';
  }
}
