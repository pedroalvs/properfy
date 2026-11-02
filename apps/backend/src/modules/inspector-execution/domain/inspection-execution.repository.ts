import type { Prisma } from '@prisma/client';
import type { InspectionExecutionEntity } from './inspection-execution.entity';

export interface IInspectionExecutionRepository {
  findByAppointmentId(appointmentId: string): Promise<InspectionExecutionEntity | null>;
  findByAppointmentIds(appointmentIds: string[]): Promise<InspectionExecutionEntity[]>;
  save(execution: InspectionExecutionEntity): Promise<void>;
  update(
    id: string,
    data: Partial<{
      finishedAt: Date | null;
      resumedAt: Date | null;
      finishLatitude: number;
      finishLongitude: number;
      // F03 finish capture.
      finishAccuracyMeters: number | null;
      finishClientAt: Date | null;
      finishGeolocationDistanceMeters: number | null;
      finishOutOfRadius: boolean;
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  /**
   * Mark an in-progress execution as abandoned (post-check-in "Can't do this
   * job"). The row is kept as a record; all readers then treat it as not started.
   */
  markAbandoned(id: string, abandonedAt: Date, tx?: Prisma.TransactionClient): Promise<void>;
  /**
   * Restart an abandoned execution in place (re-offer, new inspector). Overwrites
   * the start capture and the applied radius, and clears finish/resumed/abandoned
   * so the row reads as a fresh in-progress check-in. Reuses the same row id.
   */
  restart(
    id: string,
    data: {
      inspectorId: string;
      startedAt: Date;
      startLatitude: number;
      startLongitude: number;
      geolocationDistanceMeters: number | null;
      startAccuracyMeters: number | null;
      startClientAt: Date | null;
      outOfRadius: boolean;
      outOfWindow: boolean;
      geofenceRadiusMeters: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  findStuckExecutions(olderThanHours: number): Promise<InspectionExecutionEntity[]>;
}
