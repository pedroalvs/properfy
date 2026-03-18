import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { IPropertyImportRepository } from '../../domain/property-import.repository';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { PropertyImportEntity } from '../../domain/property-import.entity';

export interface ImportPropertiesInput {
  fileBuffer: Buffer;
  filename: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface ImportPropertiesOutput {
  importId: string;
  status: string;
  acceptedCount: number;
  warningCount: number;
  errorCount: number;
}

export class ImportPropertiesUseCase {
  constructor(
    private readonly importRepo: IPropertyImportRepository,
    private readonly storageService: IReportStorageService,
    private readonly jobQueue: IJobQueue,
    private readonly idempotencyService: IIdempotencyService,
  ) {}

  async execute(input: ImportPropertiesInput): Promise<ImportPropertiesOutput> {
    const { fileBuffer, filename, idempotencyKey, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP' && actor.role !== 'CL_ADMIN') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions for property import');
    }

    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'csv') {
      throw new ValidationError('File must be .xlsx or .csv');
    }

    const tenantId = actor.tenantId;
    if (!tenantId) {
      throw new ValidationError('Tenant context is required for import');
    }

    // Idempotency check
    const cached = await this.idempotencyService.get<ImportPropertiesOutput>(idempotencyKey, 'property.import');
    if (cached) {
      return cached;
    }

    const id = crypto.randomUUID();
    const fileKey = `imports/properties/${id}/${filename}`;

    const contentType = ext === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';
    await this.storageService.upload(fileKey, fileBuffer, contentType);

    const entity = new PropertyImportEntity({
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
    await this.jobQueue.enqueue('property.import', { importId: id });

    const result: ImportPropertiesOutput = {
      importId: id,
      status: 'PENDING',
      acceptedCount: 0,
      warningCount: 0,
      errorCount: 0,
    };

    await this.idempotencyService.set(idempotencyKey, 'property.import', result, 24);

    return result;
  }
}
