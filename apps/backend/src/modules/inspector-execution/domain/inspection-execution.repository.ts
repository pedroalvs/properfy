import type { InspectionExecutionEntity } from './inspection-execution.entity';

export interface IInspectionExecutionRepository {
  findByAppointmentId(appointmentId: string): Promise<InspectionExecutionEntity | null>;
  findByAppointmentIds(appointmentIds: string[]): Promise<InspectionExecutionEntity[]>;
  save(execution: InspectionExecutionEntity): Promise<void>;
  update(
    id: string,
    data: Partial<{
      finishedAt: Date;
      finishLatitude: number;
      finishLongitude: number;
      checklistJson: Record<string, unknown> | null;
      notes: string | null;
    }>,
  ): Promise<void>;
}
