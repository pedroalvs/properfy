import { type PrismaClient, Prisma } from '@prisma/client';
import { InspectionExecutionEntity } from '../domain/inspection-execution.entity';
import type { IInspectionExecutionRepository } from '../domain/inspection-execution.repository';

function mapToEntity(row: any): InspectionExecutionEntity {
  return new InspectionExecutionEntity({
    id: row.id,
    appointmentId: row.appointment_id,
    inspectorId: row.inspector_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    resumedAt: row.resumed_at,
    startLatitude: Number(row.start_latitude),
    startLongitude: Number(row.start_longitude),
    finishLatitude: row.finish_latitude ? Number(row.finish_latitude) : null,
    finishLongitude: row.finish_longitude ? Number(row.finish_longitude) : null,
    geolocationDistanceMeters: row.geolocation_distance_meters != null ? Number(row.geolocation_distance_meters) : null,
    checklistJson: row.checklist_json as Record<string, unknown> | null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaInspectionExecutionRepository implements IInspectionExecutionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByAppointmentId(appointmentId: string): Promise<InspectionExecutionEntity | null> {
    const row = await this.prisma.inspectionExecution.findUnique({
      where: { appointment_id: appointmentId },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByAppointmentIds(appointmentIds: string[]): Promise<InspectionExecutionEntity[]> {
    if (appointmentIds.length === 0) return [];
    const rows = await this.prisma.inspectionExecution.findMany({
      where: { appointment_id: { in: appointmentIds } },
    });
    return rows.map(mapToEntity);
  }

  async save(execution: InspectionExecutionEntity): Promise<void> {
    await this.prisma.inspectionExecution.create({
      data: {
        id: execution.id,
        appointment_id: execution.appointmentId,
        inspector_id: execution.inspectorId,
        started_at: execution.startedAt,
        finished_at: execution.finishedAt,
        resumed_at: execution.resumedAt,
        start_latitude: execution.startLatitude,
        start_longitude: execution.startLongitude,
        finish_latitude: execution.finishLatitude,
        finish_longitude: execution.finishLongitude,
        geolocation_distance_meters: execution.geolocationDistanceMeters,
        checklist_json: execution.checklistJson !== null
          ? (execution.checklistJson as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        notes: execution.notes,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      finishedAt: Date | null;
      resumedAt: Date | null;
      finishLatitude: number;
      finishLongitude: number;
      checklistJson: Record<string, unknown> | null;
      notes: string | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.finishedAt !== undefined) updateData.finished_at = data.finishedAt;
    if (data.resumedAt !== undefined) updateData.resumed_at = data.resumedAt;
    if (data.finishLatitude !== undefined) updateData.finish_latitude = data.finishLatitude;
    if (data.finishLongitude !== undefined) updateData.finish_longitude = data.finishLongitude;
    if (data.checklistJson !== undefined) updateData.checklist_json = data.checklistJson;
    if (data.notes !== undefined) updateData.notes = data.notes;
    await this.prisma.inspectionExecution.update({ where: { id }, data: updateData });
  }

  // Cross-tenant: background job processes all tenants to detect stuck inspections
  async findStuckExecutions(olderThanHours: number): Promise<InspectionExecutionEntity[]> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const rows = await this.prisma.inspectionExecution.findMany({
      where: {
        started_at: { lt: cutoff },
        finished_at: null,
      },
    });
    return rows.map(mapToEntity);
  }
}
