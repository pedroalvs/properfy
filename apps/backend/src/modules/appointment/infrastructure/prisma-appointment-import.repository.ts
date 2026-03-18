import type { PrismaClient } from '@prisma/client';
import type { IAppointmentImportRepository } from '../domain/appointment-import.repository';
import { AppointmentImportEntity } from '../domain/appointment-import.entity';

export class PrismaAppointmentImportRepository implements IAppointmentImportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string, tenantId: string | null): Promise<AppointmentImportEntity | null> {
    const where = tenantId
      ? { id, tenant_id: tenantId }
      : { id };

    const record = await this.prisma.appointmentImport.findFirst({ where });
    if (!record) return null;

    return new AppointmentImportEntity({
      id: record.id,
      tenantId: record.tenant_id,
      status: record.status,
      fileKey: record.file_key,
      originalFilename: record.original_filename,
      totalRows: record.total_rows,
      successCount: record.success_count,
      errorCount: record.error_count,
      errorsJson: record.errors_json as unknown[] | null,
      createdByUserId: record.created_by_user_id,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  }

  async save(entity: AppointmentImportEntity): Promise<void> {
    await this.prisma.appointmentImport.create({
      data: {
        id: entity.id,
        tenant_id: entity.tenantId,
        status: entity.status,
        file_key: entity.fileKey,
        original_filename: entity.originalFilename,
        total_rows: entity.totalRows,
        success_count: entity.successCount,
        error_count: entity.errorCount,
        errors_json: entity.errorsJson as object | undefined,
        created_by_user_id: entity.createdByUserId,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      status: string;
      totalRows: number;
      successCount: number;
      errorCount: number;
      errorsJson: unknown[];
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.totalRows !== undefined) updateData.total_rows = data.totalRows;
    if (data.successCount !== undefined) updateData.success_count = data.successCount;
    if (data.errorCount !== undefined) updateData.error_count = data.errorCount;
    if (data.errorsJson !== undefined) updateData.errors_json = data.errorsJson;

    await this.prisma.appointmentImport.update({
      where: { id },
      data: updateData,
    });
  }
}
