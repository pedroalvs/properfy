import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentImportWorker } from '../../../src/modules/appointment/infrastructure/workers/import.worker';
import { AppointmentImportEntity } from '../../../src/modules/appointment/domain/appointment-import.entity';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { AppointmentTimeSlotEntity } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.entity';
import type { IAppointmentImportRepository } from '../../../src/modules/appointment/domain/appointment-import.repository';
import type { IReportStorageService } from '../../../src/modules/report/domain/report-storage.service';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { IAppointmentTimeSlotRepository } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.repository';
import type { Logger } from '../../../src/shared/infrastructure/logger';

function makeImportRecord(): AppointmentImportEntity {
  return new AppointmentImportEntity({
    id: 'import-1',
    tenantId: 'tenant-1',
    status: 'PENDING',
    fileKey: 'imports/test.csv',
    originalFilename: 'test.csv',
    totalRows: 0,
    successCount: 0,
    errorCount: 0,
    errorsJson: null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-03-26T10:00:00Z'),
    updatedAt: new Date('2026-03-26T10:00:00Z'),
  });
}

function makeProperty(overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> = {}): PropertyEntity {
  return new PropertyEntity({
    id: 'property-1',
    tenantId: 'tenant-1',
    branchId: null,
    propertyCode: 'PROP-001',
    type: 'HOUSE',
    street: '1 Test St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'Australia',
    lat: null,
    lng: null,
    geocodingStatus: 'PENDING',
    notes: null,
    rulesJson: {},
    createdAt: new Date('2026-03-26T10:00:00Z'),
    updatedAt: new Date('2026-03-26T10:00:00Z'),
    deletedAt: null,
    ...overrides,
  });
}

function makeSlot(overrides: Partial<ConstructorParameters<typeof AppointmentTimeSlotEntity>[0]> = {}) {
  return new AppointmentTimeSlotEntity({
    id: 'slot-1',
    tenantId: 'tenant-1',
    branchId: null,
    label: 'Morning',
    startTime: '09:00',
    endTime: '12:00',
    sortOrder: 1,
    isActive: true,
    createdAt: new Date('2026-03-26T10:00:00Z'),
    updatedAt: new Date('2026-03-26T10:00:00Z'),
    deletedAt: null,
    ...overrides,
  });
}

describe('AppointmentImportWorker', () => {
  let importRepo: IAppointmentImportRepository;
  let storageService: IReportStorageService;
  let appointmentRepo: IAppointmentRepository;
  let propertyRepo: IPropertyRepository;
  let serviceTypeRepo: IServiceTypeRepository;
  let timeSlotRepo: IAppointmentTimeSlotRepository;
  let logger: Logger;
  let worker: AppointmentImportWorker;

  beforeEach(() => {
    importRepo = {
      findById: vi.fn().mockResolvedValue(makeImportRecord()),
      save: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };

    storageService = {
      upload: vi.fn(),
      getSignedUrl: vi.fn(),
      delete: vi.fn(),
      download: vi.fn().mockResolvedValue(
        Buffer.from(
          'propertyCode,scheduledDate,timeSlot,tenantName\n' +
          'PROP-001,2026-04-02,14:00-17:00,John Tenant\n',
        ),
      ),
    } as unknown as IReportStorageService;

    appointmentRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
      findScheduledOnDate: vi.fn(),
      findAllContacts: vi.fn(),
      countContacts: vi.fn(),
      findContactById: vi.fn(),
      findDuplicateForImport: vi.fn().mockResolvedValue(null),
    };

    propertyRepo = {
      findById: vi.fn(),
      findByIdWithBranch: vi.fn(),
      findByPropertyCode: vi.fn().mockResolvedValue(makeProperty({ branchId: null })),
      findAll: vi.fn(),
      findAllWithBranch: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };

    serviceTypeRepo = {
      findById: vi.fn(),
      findByCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };

    timeSlotRepo = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn().mockResolvedValue([makeSlot({ branchId: null, startTime: '09:00', endTime: '12:00' })]),
      findEffective: vi.fn(),
      softDelete: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    worker = new AppointmentImportWorker(
      importRepo,
      storageService,
      appointmentRepo,
      propertyRepo,
      serviceTypeRepo,
      logger,
      timeSlotRepo,
    );
  });

  it('validates imported time slots against tenant defaults when property has no branch', async () => {
    await worker.execute({ importId: 'import-1' });

    expect(timeSlotRepo.findAll).toHaveBeenCalledWith({ tenantId: 'tenant-1', branchId: null });
    expect(appointmentRepo.save).not.toHaveBeenCalled();
    expect(importRepo.update).toHaveBeenLastCalledWith(
      'import-1',
      expect.objectContaining({
        status: 'FAILED',
        totalRows: 1,
        successCount: 0,
        errorCount: 1,
        errorsJson: [
          {
            row: 2,
            field: 'timeSlot',
            message: 'Time slot "14:00-17:00" is not in the tenant default catalog',
          },
        ],
      }),
    );
  });
});
