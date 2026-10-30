import { type PrismaClient, type Prisma } from '@prisma/client';
import { InspectionExecutionEntity } from '../domain/inspection-execution.entity';
import type { IInspectionExecutionRepository } from '../domain/inspection-execution.repository';

/** Same idiom as prisma-confirmation-cycle.repository.ts — the tx client is a narrowed PrismaClient. */
type DbClient = PrismaClient | Prisma.TransactionClient;

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
    startAccuracyMeters: row.start_accuracy_m != null ? Number(row.start_accuracy_m) : null,
    finishAccuracyMeters: row.finish_accuracy_m != null ? Number(row.finish_accuracy_m) : null,
    startClientAt: row.start_client_at ?? null,
    finishClientAt: row.finish_client_at ?? null,
    finishGeolocationDistanceMeters:
      row.finish_geolocation_distance_meters != null ? Number(row.finish_geolocation_distance_meters) : null,
    outOfRadius: row.out_of_radius ?? false,
    outOfWindow: row.out_of_window ?? false,
    finishOutOfRadius: row.finish_out_of_radius ?? false,
    geofenceRadiusMeters: row.geofence_radius_m != null ? Number(row.geofence_radius_m) : null,
    abandonedAt: row.abandoned_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaInspectionExecutionRepository implements IInspectionExecutionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

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
        start_accuracy_m: execution.startAccuracyMeters,
        start_client_at: execution.startClientAt,
        out_of_radius: execution.outOfRadius,
        out_of_window: execution.outOfWindow,
        geofence_radius_m: execution.geofenceRadiusMeters,
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
      finishAccuracyMeters: number | null;
      finishClientAt: Date | null;
      finishGeolocationDistanceMeters: number | null;
      finishOutOfRadius: boolean;
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.finishedAt !== undefined) updateData.finished_at = data.finishedAt;
    if (data.resumedAt !== undefined) updateData.resumed_at = data.resumedAt;
    if (data.finishLatitude !== undefined) updateData.finish_latitude = data.finishLatitude;
    if (data.finishLongitude !== undefined) updateData.finish_longitude = data.finishLongitude;
    if (data.finishAccuracyMeters !== undefined) updateData.finish_accuracy_m = data.finishAccuracyMeters;
    if (data.finishClientAt !== undefined) updateData.finish_client_at = data.finishClientAt;
    if (data.finishGeolocationDistanceMeters !== undefined)
      updateData.finish_geolocation_distance_meters = data.finishGeolocationDistanceMeters;
    if (data.finishOutOfRadius !== undefined) updateData.finish_out_of_radius = data.finishOutOfRadius;
    await this.db(tx).inspectionExecution.update({ where: { id }, data: updateData });
  }

  async markAbandoned(id: string, abandonedAt: Date, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).inspectionExecution.update({ where: { id }, data: { abandoned_at: abandonedAt } });
  }

  async restart(
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
  ): Promise<void> {
    await this.db(tx).inspectionExecution.update({
      where: { id },
      data: {
        inspector_id: data.inspectorId,
        started_at: data.startedAt,
        start_latitude: data.startLatitude,
        start_longitude: data.startLongitude,
        geolocation_distance_meters: data.geolocationDistanceMeters,
        start_accuracy_m: data.startAccuracyMeters,
        start_client_at: data.startClientAt,
        out_of_radius: data.outOfRadius,
        out_of_window: data.outOfWindow,
        geofence_radius_m: data.geofenceRadiusMeters,
        // Clear the previous attempt so the row reads as a fresh check-in.
        abandoned_at: null,
        finished_at: null,
        resumed_at: null,
        finish_latitude: null,
        finish_longitude: null,
        finish_accuracy_m: null,
        finish_client_at: null,
        finish_geolocation_distance_meters: null,
        finish_out_of_radius: false,
      },
    });
  }

  // Cross-tenant: background job processes all tenants to detect stuck inspections
  async findStuckExecutions(olderThanHours: number): Promise<InspectionExecutionEntity[]> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const rows = await this.prisma.inspectionExecution.findMany({
      where: {
        started_at: { lt: cutoff },
        finished_at: null,
        // An abandoned check-in is not stuck — it is a closed record awaiting re-offer.
        abandoned_at: null,
      },
    });
    return rows.map(mapToEntity);
  }
}
