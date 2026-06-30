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

function makeProperty(): PropertyEntity {
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
  });
}

function makeSlot(startTime = '09:00', endTime = '12:00'): AppointmentTimeSlotEntity {
  return new AppointmentTimeSlotEntity({
    id: 'slot-1',
    tenantId: 'tenant-1',
    branchId: null,
    label: 'Morning',
    startTime,
    endTime,
    sortOrder: 1,
    isActive: true,
    createdAt: new Date('2026-03-26T10:00:00Z'),
    updatedAt: new Date('2026-03-26T10:00:00Z'),
    deletedAt: null,
  });
}

function makeWorker(
  csvContent: string,
  opts: { includeTimeSlotRepo?: boolean } = { includeTimeSlotRepo: false },
): {
  worker: AppointmentImportWorker;
  importRepo: IAppointmentImportRepository;
  appointmentRepo: IAppointmentRepository;
  propertyRepo: IPropertyRepository;
  storageService: IReportStorageService;
  timeSlotRepo: IAppointmentTimeSlotRepository;
} {
  const importRepo: IAppointmentImportRepository = {
    findById: vi.fn().mockResolvedValue(makeImportRecord()),
    save: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  };

  const storageService = {
    upload: vi.fn(),
    getSignedUrl: vi.fn(),
    delete: vi.fn(),
    download: vi.fn().mockResolvedValue(Buffer.from(csvContent)),
  } as unknown as IReportStorageService;

  const appointmentRepo: IAppointmentRepository = {
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn(),
    saveContact: vi.fn().mockResolvedValue(undefined),
    updateContact: vi.fn(),
    saveRestriction: vi.fn(),
    deleteRestrictionsByAppointmentId: vi.fn(),
    findScheduledOnDate: vi.fn(),
    findAllContacts: vi.fn(),
    countContacts: vi.fn(),
    findContactById: vi.fn(),
    findDuplicateForImport: vi.fn().mockResolvedValue(null),
  };

  const propertyRepo: IPropertyRepository = {
    findById: vi.fn(),
    findByIdWithBranch: vi.fn(),
    findByPropertyCode: vi.fn().mockResolvedValue(makeProperty()),
    findAll: vi.fn(),
    findAllWithBranch: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  const serviceTypeRepo: IServiceTypeRepository = {
    findById: vi.fn(),
    findByCode: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  const timeSlotRepo: IAppointmentTimeSlotRepository = {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue([makeSlot('09:00', '12:00')]),
    findEffective: vi.fn(),
    softDelete: vi.fn(),
  };

  const logger: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;

  const worker = new AppointmentImportWorker(
    importRepo,
    storageService,
    appointmentRepo,
    propertyRepo,
    serviceTypeRepo,
    logger,
    opts.includeTimeSlotRepo ? timeSlotRepo : undefined,
  );

  return { worker, importRepo, appointmentRepo, propertyRepo, storageService, timeSlotRepo };
}

describe('AppointmentImportWorker — field name alignment with template headers', () => {
  describe('timeSlotLabel (new column name)', () => {
    it('accepts a row with timeSlotLabel present and matching a slot — no timeSlotLabel validation error', async () => {
      // The slot compositeValue is "09:00-12:00" (startTime-endTime)
      const csv = 'propertyCode,scheduledDate,timeSlotLabel,primaryContactName\nPROP-001,2026-04-02,09:00-12:00,John Tenant\n';
      const { worker, importRepo } = makeWorker(csv, { includeTimeSlotRepo: true });

      await worker.execute({ importId: 'import-1' });

      const lastCall = (importRepo.update as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1];
      const errors: { field: string }[] = lastCall.errorsJson ?? [];
      const timeSlotErrors = errors.filter((e) => e.field === 'timeSlotLabel');
      expect(timeSlotErrors).toHaveLength(0);
    });

    it('rejects a row missing timeSlotLabel with error field = "timeSlotLabel" (not "timeSlot")', async () => {
      const csv = 'propertyCode,scheduledDate,primaryContactName\nPROP-001,2026-04-02,John Tenant\n';
      const { worker, importRepo } = makeWorker(csv);

      await worker.execute({ importId: 'import-1' });

      const lastCall = (importRepo.update as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1];
      const errors: { field: string; message: string }[] = lastCall.errorsJson ?? [];
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'timeSlotLabel' }),
      );
      // Must NOT produce old field name
      expect(errors.map((e) => e.field)).not.toContain('timeSlot');
    });
  });

  describe('primaryContactName (new column name)', () => {
    it('accepts a row with primaryContactName present — no primaryContactName validation error', async () => {
      const csv = 'propertyCode,scheduledDate,timeSlotLabel,primaryContactName\nPROP-001,2026-04-02,09:00-12:00,John Tenant\n';
      const { worker, importRepo } = makeWorker(csv, { includeTimeSlotRepo: true });

      await worker.execute({ importId: 'import-1' });

      const lastCall = (importRepo.update as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1];
      const errors: { field: string }[] = lastCall.errorsJson ?? [];
      const contactNameErrors = errors.filter((e) => e.field === 'primaryContactName');
      expect(contactNameErrors).toHaveLength(0);
    });

    it('rejects a row missing primaryContactName with error field = "primaryContactName" (not "rentalTenantName")', async () => {
      // timeSlotLabel present and valid so we isolate the primaryContactName check
      const csv = 'propertyCode,scheduledDate,timeSlotLabel\nPROP-001,2026-04-02,09:00-12:00\n';
      const { worker, importRepo } = makeWorker(csv, { includeTimeSlotRepo: true });

      await worker.execute({ importId: 'import-1' });

      const lastCall = (importRepo.update as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1];
      const errors: { field: string }[] = lastCall.errorsJson ?? [];
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'primaryContactName' }),
      );
      // Must NOT produce old field name
      expect(errors.map((e) => e.field)).not.toContain('rentalTenantName');
    });
  });

  describe('primaryContactEmail (new column name)', () => {
    it('reads primaryContactEmail from row and passes it to the contact entity — not rentalTenantEmail', async () => {
      const csv =
        'propertyCode,scheduledDate,timeSlotLabel,primaryContactName,primaryContactEmail\n' +
        'PROP-001,2026-04-02,09:00-12:00,John Tenant,john@example.com\n';
      const { worker, appointmentRepo } = makeWorker(csv, { includeTimeSlotRepo: true });

      await worker.execute({ importId: 'import-1' });

      const saveContactCall = (appointmentRepo.saveContact as ReturnType<typeof vi.fn>).mock.calls.at(0)![0];
      // The contact entity must carry the email from primaryContactEmail
      expect(saveContactCall.snapshotEmail).toBe('john@example.com');
      expect(saveContactCall.primaryEmail).toBe('john@example.com');
      // The CSV column used is primaryContactEmail, not the old rentalTenantEmail
      expect(Object.keys(saveContactCall)).not.toContain('rentalTenantEmail');
    });

    it('saves a row with no primaryContactEmail without error — the field is optional', async () => {
      const csv =
        'propertyCode,scheduledDate,timeSlotLabel,primaryContactName\n' +
        'PROP-001,2026-04-02,09:00-12:00,John Tenant\n';
      const { worker, importRepo, appointmentRepo } = makeWorker(csv, { includeTimeSlotRepo: true });

      await worker.execute({ importId: 'import-1' });

      const lastCall = (importRepo.update as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1];
      const errors: { field: string }[] = lastCall.errorsJson ?? [];
      const emailErrors = errors.filter((e) => e.field === 'primaryContactEmail');
      expect(emailErrors).toHaveLength(0);
      // Contact was still created — snapshotEmail is null when omitted
      const saveContactCall = (appointmentRepo.saveContact as ReturnType<typeof vi.fn>).mock.calls.at(0)![0];
      expect(saveContactCall.snapshotEmail).toBeNull();
    });
  });

  describe('primaryContactPhone (new column name)', () => {
    it('reads primaryContactPhone from row and passes it to the contact entity — not rentalTenantPhone', async () => {
      const csv =
        'propertyCode,scheduledDate,timeSlotLabel,primaryContactName,primaryContactPhone\n' +
        'PROP-001,2026-04-02,09:00-12:00,John Tenant,+61400000001\n';
      const { worker, appointmentRepo } = makeWorker(csv, { includeTimeSlotRepo: true });

      await worker.execute({ importId: 'import-1' });

      const saveContactCall = (appointmentRepo.saveContact as ReturnType<typeof vi.fn>).mock.calls.at(0)![0];
      // The contact entity must carry the phone from primaryContactPhone
      expect(saveContactCall.snapshotPhone).toBe('+61400000001');
      expect(saveContactCall.primaryPhone).toBe('+61400000001');
      // The CSV column used is primaryContactPhone, not the old rentalTenantPhone
      expect(Object.keys(saveContactCall)).not.toContain('rentalTenantPhone');
    });

    it('saves a row with no primaryContactPhone without error — the field is optional', async () => {
      const csv =
        'propertyCode,scheduledDate,timeSlotLabel,primaryContactName\n' +
        'PROP-001,2026-04-02,09:00-12:00,John Tenant\n';
      const { worker, importRepo, appointmentRepo } = makeWorker(csv, { includeTimeSlotRepo: true });

      await worker.execute({ importId: 'import-1' });

      const lastCall = (importRepo.update as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1];
      const errors: { field: string }[] = lastCall.errorsJson ?? [];
      const phoneErrors = errors.filter((e) => e.field === 'primaryContactPhone');
      expect(phoneErrors).toHaveLength(0);
      // Contact was still created — snapshotPhone is null when omitted
      const saveContactCall = (appointmentRepo.saveContact as ReturnType<typeof vi.fn>).mock.calls.at(0)![0];
      expect(saveContactCall.snapshotPhone).toBeNull();
    });
  });
});
