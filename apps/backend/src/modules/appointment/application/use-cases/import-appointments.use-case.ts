import { createHash } from 'node:crypto';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { IAppointmentImportRepository } from '../../domain/appointment-import.repository';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { AppointmentImportEntity } from '../../domain/appointment-import.entity';
import { AppointmentImportIdempotencyPayloadMismatchError } from '../../domain/appointment.errors';

export interface ImportAppointmentsInput {
  fileBuffer: Buffer;
  filename: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface ImportAppointmentsOutput {
  importId: string;
  status: string;
  acceptedCount: number;
  warningCount: number;
  errorCount: number;
}

export class ImportAppointmentsUseCase {
  constructor(
    private readonly importRepo: IAppointmentImportRepository,
    private readonly storageService: IReportStorageService,
    private readonly jobQueue: IJobQueue,
    private readonly idempotencyService: IIdempotencyService,
  ) {}

  async execute(input: ImportAppointmentsInput): Promise<ImportAppointmentsOutput> {
    const { fileBuffer, filename, idempotencyKey, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP' && actor.role !== 'CL_ADMIN') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions for appointment import');
    }

    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'csv') {
      throw new ValidationError('File must be .xlsx or .csv');
    }

    const tenantId = actor.tenantId;
    if (!tenantId) {
      throw new ValidationError('Tenant context is required for import');
    }

    // Idempotency check with payload hash verification
    const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
    const cached = await this.idempotencyService.getWithHash<ImportAppointmentsOutput>(idempotencyKey, 'appointment.import');
    if (cached) {
      if (cached.payloadHash && cached.payloadHash !== fileHash) {
        throw new AppointmentImportIdempotencyPayloadMismatchError();
      }
      return cached.response;
    }

    const id = crypto.randomUUID();
    const fileKey = `imports/appointments/${id}/${filename}`;

    const contentType = ext === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';
    await this.storageService.upload(fileKey, fileBuffer, contentType);

    const entity = new AppointmentImportEntity({
      id,
      tenantId,
      status: 'PENDING',
      fileKey,
      originalFilename: filename,
      totalRows: 0,
      successCount: 0,
      errorCount: 0,
      errorsJson: null,
      createdByUserId: actor.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.importRepo.save(entity);
    await this.jobQueue.enqueue('appointment.import', { importId: id });

    const result: ImportAppointmentsOutput = {
      importId: id,
      status: 'PENDING',
      acceptedCount: 0,
      warningCount: 0,
      errorCount: 0,
    };

    await this.idempotencyService.set(idempotencyKey, 'appointment.import', result, 24, fileHash);

    return result;
  }
}
