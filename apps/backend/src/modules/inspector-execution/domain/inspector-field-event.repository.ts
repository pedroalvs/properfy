import type { Prisma } from '@prisma/client';
import type {
  InspectorFieldEventEntity,
  LatestCantDo,
  FieldEventRecord,
} from './inspector-field-event.entity';

/** Latest LATE_NOTICE per appointment (F06 ETA floor, D18). */
export interface LatestLateNotice {
  appointmentId: string;
  minutesLate: number;
  createdAt: Date;
  clientOccurredAt: Date | null;
}

export interface IInspectorFieldEventRepository {
  create(event: InspectorFieldEventEntity, tx?: Prisma.TransactionClient): Promise<void>;
  /**
   * Latest CANT_DO per appointment for a page of ids, in ONE query (DISTINCT ON),
   * joined to the inspector name. Used by the appointment list/detail to populate
   * `inspectorIssue` without an N+1. Empty input → no query.
   */
  findLatestCantDoByAppointmentIds(appointmentIds: string[]): Promise<LatestCantDo[]>;
  /**
   * Latest LATE_NOTICE per appointment created at/after `since`, in ONE query
   * (DISTINCT ON). Used by the F06 ETA plan reader to apply the published-ETA
   * floor (D18). Empty input → no query.
   */
  findLatestLateNoticeByAppointmentIds(
    appointmentIds: string[],
    since: Date,
  ): Promise<LatestLateNotice[]>;
  /** Latest CANT_DO of a single appointment (detail + rejection-email context). */
  findLatestCantDoByAppointmentId(
    appointmentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LatestCantDo | null>;
  /** All field events of an appointment, newest first, capped (field-activity API). */
  listByAppointmentId(appointmentId: string, limit: number): Promise<FieldEventRecord[]>;
  /**
   * Row lock on the appointment, taken as the FIRST statement of a field-event /
   * finish transaction so the two serialize on the same row (deadlock-safe).
   * `SELECT id FROM appointments WHERE id = $1 FOR UPDATE`.
   */
  lockAppointmentForFieldEvent(appointmentId: string, tx: Prisma.TransactionClient): Promise<void>;
}
