import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportPropertyWorker } from '../../../src/modules/property/infrastructure/workers/import-property.worker';
import type { IPropertyImportRepository } from '../../../src/modules/property/domain/property-import.repository';
import type { IReportStorageService } from '../../../src/modules/report/domain/report-storage.service';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { IJobQueue } from '../../../src/shared/domain/job-queue';
import type { PropertyImportEntity } from '../../../src/modules/property/domain/property-import.entity';

function makeCsvBuffer(rows: string[]): Buffer {
  const header = 'propertyCode,type,street,addressLine2,suburb,postcode,state,country,notes';
  return Buffer.from([header, ...rows].join('\n'));
}

function makeImportRecord(overrides: Partial<PropertyImportEntity> = {}): PropertyImportEntity {
  return {
    id: 'import-1',
    tenantId: 'tenant-1',
    status: 'PENDING',
    fileKey: 'imports/properties/import-1/properties.csv',
    originalFilename: 'properties.csv',
    totalRows: 0,
    successCount: 0,
    errorCount: 0,
    errorsJson: null,
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PropertyImportEntity;
}

describe('ImportPropertyWorker', () => {
  let importRepo: IPropertyImportRepository;
  let storageService: IReportStorageService;
  let propertyRepo: IPropertyRepository;
  let logger: Logger;
  let auditService: AuditService;
  let jobQueue: IJobQueue;
  let worker: ImportPropertyWorker;

  beforeEach(() => {
    importRepo = {
      findById: vi.fn().mockResolvedValue(makeImportRecord()),
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };
    storageService = {
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(Buffer.from('')),
      getSignedUrl: vi.fn(),
      delete: vi.fn(),
    } as unknown as IReportStorageService;
    propertyRepo = {
      findByPropertyCode: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findAll: vi.fn(),
      softDelete: vi.fn(),
      update: vi.fn(),
    } as unknown as IPropertyRepository;
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
    auditService = {
      log: vi.fn(),
    };
    jobQueue = {
      enqueue: vi.fn().mockResolvedValue('job-1'),
    } as unknown as IJobQueue;

    worker = new ImportPropertyWorker(
      importRepo, storageService, propertyRepo, logger, auditService, jobQueue,
    );
  });

  it('should write a batch audit record after successful import', async () => {
    const csv = makeCsvBuffer([
      'P001,RESIDENTIAL,123 Main St,,Sydney,2000,NSW,AU,',
      'P002,COMMERCIAL,456 High St,,Melbourne,3000,VIC,AU,',
    ]);
    vi.mocked(storageService.download).mockResolvedValue(csv);

    await worker.execute({ importId: 'import-1' });

    expect(auditService.log).toHaveBeenCalledOnce();
    const auditCall = vi.mocked(auditService.log).mock.calls[0]![0]!;
    expect(auditCall.action).toBe('property.imported.batch');
    expect(auditCall.actorType).toBe('USER');
    expect(auditCall.actorId).toBe('user-1');
    expect(auditCall.entityType).toBe('PropertyImport');
    expect(auditCall.entityId).toBe('import-1');
    expect(auditCall.tenantId).toBe('tenant-1');

    const after = auditCall.after as Record<string, unknown>;
    expect(after.importId).toBe('import-1');
    expect(after.totalRows).toBe(2);
    expect(after.successCount).toBe(2);
    expect(after.errorCount).toBe(0);
    expect(after.propertyIds).toHaveLength(2);
  });

  it('should include correct counts in batch audit for partial success', async () => {
    const csv = makeCsvBuffer([
      'P001,RESIDENTIAL,123 Main St,,Sydney,2000,NSW,AU,',
      ',RESIDENTIAL,456 High St,,Melbourne,3000,VIC,AU,', // missing propertyCode
      'P003,COMMERCIAL,789 Low St,,Brisbane,4000,QLD,AU,',
    ]);
    vi.mocked(storageService.download).mockResolvedValue(csv);

    await worker.execute({ importId: 'import-1' });

    expect(auditService.log).toHaveBeenCalledOnce();
    const auditCall = vi.mocked(auditService.log).mock.calls[0]![0]!;
    const after = auditCall.after as Record<string, unknown>;
    expect(after.totalRows).toBe(3);
    expect(after.successCount).toBe(2);
    expect(after.errorCount).toBe(1);
    expect(after.propertyIds).toHaveLength(2);
  });

  it('should write batch audit even when all rows fail validation', async () => {
    const csv = makeCsvBuffer([
      ',RESIDENTIAL,123 Main St,,Sydney,2000,NSW,AU,', // missing propertyCode
      'P002,INVALID_TYPE,456 High St,,Melbourne,3000,VIC,AU,', // invalid type
    ]);
    vi.mocked(storageService.download).mockResolvedValue(csv);

    await worker.execute({ importId: 'import-1' });

    expect(auditService.log).toHaveBeenCalledOnce();
    const auditCall = vi.mocked(auditService.log).mock.calls[0]![0]!;
    const after = auditCall.after as Record<string, unknown>;
    expect(after.totalRows).toBe(2);
    expect(after.successCount).toBe(0);
    expect(after.errorCount).toBe(2);
    expect(after.propertyIds).toHaveLength(0);
  });

  it('should contain the correct importId and tenantId in batch audit', async () => {
    const record = makeImportRecord({
      id: 'import-42',
      tenantId: 'tenant-99',
      createdByUserId: 'user-55',
    });
    vi.mocked(importRepo.findById).mockResolvedValue(record);

    const csv = makeCsvBuffer([
      'P001,RESIDENTIAL,123 Main St,,Sydney,2000,NSW,AU,',
    ]);
    vi.mocked(storageService.download).mockResolvedValue(csv);

    await worker.execute({ importId: 'import-42' });

    const auditCall = vi.mocked(auditService.log).mock.calls[0]![0]!;
    expect(auditCall.entityId).toBe('import-42');
    expect(auditCall.tenantId).toBe('tenant-99');
    expect(auditCall.actorId).toBe('user-55');
    const after = auditCall.after as Record<string, unknown>;
    expect(after.importId).toBe('import-42');
  });

  it('should not write batch audit when import record is not found', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(null);

    await worker.execute({ importId: 'missing-import' });

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should not write batch audit when processing throws unexpectedly', async () => {
    vi.mocked(storageService.download).mockRejectedValue(new Error('Storage failure'));

    await expect(worker.execute({ importId: 'import-1' })).rejects.toThrow('Storage failure');
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should track property IDs from successfully created rows', async () => {
    const csv = makeCsvBuffer([
      'P001,RESIDENTIAL,123 Main St,,Sydney,2000,NSW,AU,',
    ]);
    vi.mocked(storageService.download).mockResolvedValue(csv);

    await worker.execute({ importId: 'import-1' });

    const auditCall = vi.mocked(auditService.log).mock.calls[0]![0]!;
    const after = auditCall.after as Record<string, unknown>;
    const propertyIds = after.propertyIds as string[];
    expect(propertyIds).toHaveLength(1);
    // Property ID should be a valid UUID
    expect(propertyIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
