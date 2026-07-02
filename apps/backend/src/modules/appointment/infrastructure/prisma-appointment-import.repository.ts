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
      branchId: record.branch_id,
      status: record.status,
      fileKey: record.file_key,
      originalFilename: record.original_filename,
      totalRows: record.total_rows,
      successCount: record.success_count,
      errorCount: record.error_count,
      errorsJson: record.errors_json as unknown[] | null,
      previewJson: record.preview_json,
      resultsJson: record.results_json,
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
        branch_id: entity.branchId,
        status: entity.status,
        file_key: entity.fileKey,
        original_filename: entity.originalFilename,
        total_rows: entity.totalRows,
        success_count: entity.successCount,
        error_count: entity.errorCount,
        errors_json: entity.errorsJson as object | undefined,
        preview_json: entity.previewJson as object | undefined,
        results_json: entity.resultsJson as object | undefined,
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
      previewJson: unknown;
      resultsJson: unknown;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.totalRows !== undefined) updateData.total_rows = data.totalRows;
    if (data.successCount !== undefined) updateData.success_count = data.successCount;
    if (data.errorCount !== undefined) updateData.error_count = data.errorCount;
    if (data.errorsJson !== undefined) updateData.errors_json = data.errorsJson;
    if (data.previewJson !== undefined) updateData.preview_json = data.previewJson;
    if (data.resultsJson !== undefined) updateData.results_json = data.resultsJson;

    await this.prisma.appointmentImport.update({
      where: { id },
      data: updateData,
    });
  }

  async findAbandonedPreviews(olderThan: Date): Promise<Array<{ id: string; fileKey: string }>> {
    const rows = await this.prisma.appointmentImport.findMany({
      where: { status: 'PREVIEW', created_at: { lt: olderThan } },
      select: { id: true, file_key: true },
    });
    return rows.map((r) => ({ id: r.id, fileKey: r.file_key }));
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.appointmentImport.delete({ where: { id } });
  }
}
