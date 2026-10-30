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
  findStuckExecutions(olderThanHours: number): Promise<InspectionExecutionEntity[]>;
}
