import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { AppointmentImportCommitWorker } from './appointment-import-commit.worker';
import { AppointmentImportEntity } from '../../domain/appointment-import.entity';
import type { AuthContext } from '@properfy/shared';

const ACTOR: AuthContext = { userId: 'user-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };

function buildRecord(overrides: Partial<ConstructorParameters<typeof AppointmentImportEntity>[0]> = {}) {
  const now = new Date();
  return new AppointmentImportEntity({
    id: 'import-1', tenantId: 'tenant-1', branchId: 'branch-1', status: 'PREVIEW',
    fileKey: 'imports/appointments/import-1/f.csv', originalFilename: 'f.csv',
    totalRows: 0, successCount: 0, errorCount: 0, errorsJson: null,
    previewJson: null, resultsJson: null,
    createdByUserId: 'user-1', createdAt: now, updatedAt: now,
    ...overrides,
  });
}

function readyRow(overrides: Record<string, unknown> = {}) {
  return {
    rowNumber: 2, severity: 'ready', importable: true,
    serviceTypeName: 'Routine Inspection', serviceTypeId: 'st-1',
    scheduledDate: '2027-06-20', scheduledDateDefaulted: false,
    timeSlotStart: '09:00', timeSlotEnd: '10:00', timeDefaulted: false,
    notes: null,
    property: {
      resolution: 'existing', propertyId: 'prop-1', propertyCode: 'PROP-001',
      street: '1 Main St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217', country: 'AU',
      duplicateOfRow: null,
    },
    contact: {
      resolution: 'new', contactId: null, displayName: 'Jane Smith',
      primaryEmail: 'jane@example.com', primaryPhone: '0412345678',
      additionalChannels: [], channelsDropped: false,
    },
    customFields: [], customFieldsTruncated: false,
    issues: [],
    ...overrides,
  };
}

function buildDeps() {
  return {
    importRepo: { findById: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
    storageService: { download: vi.fn().mockResolvedValue(Buffer.from('Type\nRoutine Inspection\n')), upload: vi.fn() },
    propertyRepo: { save: vi.fn().mockResolvedValue(undefined), findByNormalizedAddress: vi.fn() },
    resolver: { resolve: vi.fn() },
    createAppointmentUseCase: { execute: vi.fn().mockResolvedValue({ id: 'apt-1' }) },
    jobQueue: { enqueue: vi.fn() },
    auditService: { log: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

function buildWorker(deps: ReturnType<typeof buildDeps>) {
  return new AppointmentImportCommitWorker(
    deps.importRepo as any,
    deps.storageService as any,
    deps.propertyRepo as any,
    deps.resolver as any,
    deps.createAppointmentUseCase as any,
    deps.jobQueue as any,
    deps.auditService as any,
    deps.logger as any,
  );
}

describe('AppointmentImportCommitWorker', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('logs a warning and returns early when the import record is gone (swept)', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(null);
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'missing', actor: ACTOR });
    expect(deps.logger.warn).toHaveBeenCalled();
    expect(deps.resolver.resolve).not.toHaveBeenCalled();
  });

  it('sets status to PROCESSING at the start', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({ rows: [] });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });
    expect(deps.importRepo.update).toHaveBeenCalledWith('import-1', { status: 'PROCESSING' });
  });

  it('creates an appointment for an importable row with an existing property', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({ rows: [readyRow()] });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    expect(deps.propertyRepo.save).not.toHaveBeenCalled();
    expect(deps.createAppointmentUseCase.execute).toHaveBeenCalledTimes(1);
    const input = deps.createAppointmentUseCase.execute.mock.calls[0]![0];
    expect(input.branchId).toBe('branch-1');
    expect(input.propertyId).toBe('prop-1');
    expect(input.serviceTypeId).toBe('st-1');
    expect(input.scheduledDate).toBe('2027-06-20');
    expect(input.timeSlotStart).toBe('09:00');
    expect(input.timeSlotEnd).toBe('10:00');
    expect(input.skipTimeInPastCheck).toBe(true);
    expect(input.idempotencyKey).toBe('import:import-1:row:2');
    expect(input.actor).toBe(ACTOR);
    expect(input.contacts).toEqual([
      { inline: { type: 'RENTAL_TENANT', displayName: 'Jane Smith', primaryEmail: 'jane@example.com', primaryPhone: '0412345678', additionalChannels: [] }, role: 'RENTAL_TENANT', isPrimary: true },
    ]);
  });

  it('passes the sheet data as the inline payload for a snapshot-only contact plan', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({
      rows: [readyRow({
        severity: 'warning',
        contact: {
          resolution: 'snapshot-only', contactId: null, displayName: 'Jane Smith',
          primaryEmail: 'jane@example.com', primaryPhone: '0412345678',
          additionalChannels: [], channelsDropped: false,
        },
        issues: [{ field: 'contact', code: 'CONTACT_MISMATCH_SNAPSHOT_ONLY', severity: 'warning', message: 'Row contact differs from the registry contact' }],
      })],
    });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    expect(deps.createAppointmentUseCase.execute).toHaveBeenCalledTimes(1);
    const input = deps.createAppointmentUseCase.execute.mock.calls[0]![0];
    expect(input.contacts).toEqual([
      { inline: { type: 'RENTAL_TENANT', displayName: 'Jane Smith', primaryEmail: 'jane@example.com', primaryPhone: '0412345678', additionalChannels: [] }, role: 'RENTAL_TENANT', isPrimary: true },
    ]);
  });

  it('creates the appointment with no contacts when the row has no contact (CONTACT_INCOMPLETE is a warning, not a blocker)', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({
      rows: [readyRow({
        severity: 'warning', contact: null,
        issues: [{ field: 'contact', code: 'CONTACT_INCOMPLETE', severity: 'warning', message: 'Primary contact is incomplete' }],
      })],
    });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    expect(deps.createAppointmentUseCase.execute).toHaveBeenCalledTimes(1);
    const input = deps.createAppointmentUseCase.execute.mock.calls[0]![0];
    expect(input.contacts).toEqual([]);
    const [resultsUpdate] = deps.importRepo.update.mock.calls
      .map((c: any[]) => c[1])
      .filter((data: any) => data.resultsJson);
    expect(resultsUpdate.resultsJson.at(-1)).toEqual({ rowNumber: 2, status: 'created', appointmentId: 'apt-1' });
  });

  it('creates a new property directly (bypassing CreatePropertyUseCase) and enqueues async geocode', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({
      rows: [readyRow({ property: { resolution: 'new', propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: null } })],
    });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    expect(deps.propertyRepo.save).toHaveBeenCalledTimes(1);
    const savedProperty = deps.propertyRepo.save.mock.calls[0]![0];
    expect(savedProperty.street).toBe('9 New St');
    expect(savedProperty.type).toBe('HOUSE');
    expect(savedProperty.apartmentNumber).toBeNull();
    expect(savedProperty.geocodingStatus).toBe('PENDING');
    expect(deps.jobQueue.enqueue).toHaveBeenCalledWith('property.geocode', { propertyId: savedProperty.id });

    const input = deps.createAppointmentUseCase.execute.mock.calls[0]![0];
    expect(input.propertyId).toBe(savedProperty.id);
  });

  it('creates the property as APARTMENT with the apartment number when the plan carries one', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({
      rows: [readyRow({ property: { resolution: 'new', propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, apartmentNumber: '4B', suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: null } })],
    });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    const savedProperty = deps.propertyRepo.save.mock.calls[0]![0];
    expect(savedProperty.type).toBe('APARTMENT');
    expect(savedProperty.apartmentNumber).toBe('4B');
  });

  it('never saves a property for an existing-property plan even when it carries an apartment number', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({
      rows: [readyRow({ property: { ...readyRow().property as object, apartmentNumber: '4B' } })],
    });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    expect(deps.propertyRepo.save).not.toHaveBeenCalled();
    expect(deps.createAppointmentUseCase.execute.mock.calls[0]![0].propertyId).toBe('prop-1');
  });

  it('creates a new property only once for two rows sharing the same new address (intra-batch dedupe)', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    const newAddr = { resolution: 'new' as const, propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: null };
    deps.resolver.resolve.mockResolvedValue({
      rows: [readyRow({ rowNumber: 2, property: newAddr }), readyRow({ rowNumber: 3, property: { ...newAddr, duplicateOfRow: 2 } })],
    });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    expect(deps.propertyRepo.save).toHaveBeenCalledTimes(1);
    const savedPropertyId = deps.propertyRepo.save.mock.calls[0]![0].id;
    expect(deps.createAppointmentUseCase.execute).toHaveBeenCalledTimes(2);
    expect(deps.createAppointmentUseCase.execute.mock.calls[0]![0].propertyId).toBe(savedPropertyId);
    expect(deps.createAppointmentUseCase.execute.mock.calls[1]![0].propertyId).toBe(savedPropertyId);
  });

  it('reuses a found geocode from previewJson: SUCCESS with coordinates, NO async geocode job', async () => {
    const deps = buildDeps();
    const newAddr = { resolution: 'new' as const, propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: null };
    deps.importRepo.findById.mockResolvedValue(buildRecord({
      previewJson: { summary: {}, rows: [{ property: { ...newAddr, geocode: { status: 'found', lat: -33.97, lng: 151.12 } } }] },
    }));
    deps.resolver.resolve.mockResolvedValue({ rows: [readyRow({ property: newAddr })] });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    const savedProperty = deps.propertyRepo.save.mock.calls[0]![0];
    expect(savedProperty.geocodingStatus).toBe('SUCCESS');
    expect(savedProperty.lat).toBe(-33.97);
    expect(savedProperty.lng).toBe(151.12);
    expect(deps.jobQueue.enqueue).not.toHaveBeenCalledWith('property.geocode', expect.anything());
  });

  it('persists a not_found geocode as FAILED without enqueueing a geocode job', async () => {
    const deps = buildDeps();
    const newAddr = { resolution: 'new' as const, propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: null };
    deps.importRepo.findById.mockResolvedValue(buildRecord({
      previewJson: { summary: {}, rows: [{ property: { ...newAddr, geocode: { status: 'not_found', lat: null, lng: null } } }] },
    }));
    deps.resolver.resolve.mockResolvedValue({ rows: [readyRow({ property: newAddr })] });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    const savedProperty = deps.propertyRepo.save.mock.calls[0]![0];
    expect(savedProperty.geocodingStatus).toBe('FAILED');
    expect(savedProperty.lat).toBeNull();
    expect(deps.jobQueue.enqueue).not.toHaveBeenCalledWith('property.geocode', expect.anything());
  });

  it('falls back to PENDING + async job when the preview verification was unverified', async () => {
    const deps = buildDeps();
    const newAddr = { resolution: 'new' as const, propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: null };
    deps.importRepo.findById.mockResolvedValue(buildRecord({
      previewJson: { summary: {}, rows: [{ property: { ...newAddr, geocode: { status: 'unverified', lat: null, lng: null } } }] },
    }));
    deps.resolver.resolve.mockResolvedValue({ rows: [readyRow({ property: newAddr })] });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    const savedProperty = deps.propertyRepo.save.mock.calls[0]![0];
    expect(savedProperty.geocodingStatus).toBe('PENDING');
    expect(deps.jobQueue.enqueue).toHaveBeenCalledWith('property.geocode', { propertyId: savedProperty.id });
  });

  it('falls back to findByNormalizedAddress on a genuine concurrent-duplicate-address conflict', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({
      rows: [readyRow({ property: { resolution: 'new', propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: null } })],
    });
    deps.propertyRepo.save.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002', clientVersion: '5.22.0', meta: { target: ['tenant_id', 'normalized_address_key'] },
      }),
    );
    deps.propertyRepo.findByNormalizedAddress.mockResolvedValue({ id: 'concurrently-created-prop' });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    const input = deps.createAppointmentUseCase.execute.mock.calls[0]![0];
    expect(input.propertyId).toBe('concurrently-created-prop');
  });

  it('records an error outcome for a non-importable row without calling CreateAppointmentUseCase', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({
      rows: [readyRow({ importable: false, severity: 'error', issues: [{ field: 'serviceType', code: 'SERVICE_TYPE_NOT_FOUND', severity: 'error', message: 'No such type' }] })],
    });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    expect(deps.createAppointmentUseCase.execute).not.toHaveBeenCalled();
    const lastResultsUpdate = deps.importRepo.update.mock.calls.find((c: unknown[]) => c[1] && (c[1] as any).resultsJson);
    expect(lastResultsUpdate![1].resultsJson).toEqual([
      expect.objectContaining({ rowNumber: 2, status: 'error', message: expect.stringContaining('No such type') }),
    ]);
  });

  it('one row throwing does not abort the rest of the batch', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({ rows: [readyRow({ rowNumber: 2 }), readyRow({ rowNumber: 3 })] });
    deps.createAppointmentUseCase.execute
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'apt-2' });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    expect(deps.createAppointmentUseCase.execute).toHaveBeenCalledTimes(2);
    const finalUpdate = deps.importRepo.update.mock.calls.find((c: unknown[]) => (c[1] as any)?.status === 'COMPLETED');
    expect(finalUpdate![1]).toEqual(expect.objectContaining({ successCount: 1, errorCount: 1 }));
  });

  it('writes resultsJson incrementally after each row', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({ rows: [readyRow({ rowNumber: 2 }), readyRow({ rowNumber: 3 })] });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    const resultsUpdates = deps.importRepo.update.mock.calls.filter((c: unknown[]) => (c[1] as any)?.resultsJson);
    expect(resultsUpdates.length).toBeGreaterThanOrEqual(2);
    expect(resultsUpdates[0]![1].resultsJson).toHaveLength(1);
    expect(resultsUpdates[resultsUpdates.length - 1]![1].resultsJson).toHaveLength(2);
  });

  it('updates successCount/errorCount/totalRows on every row, not just at the end (frontend progress bar depends on this)', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({
      rows: [readyRow({ rowNumber: 2 }), readyRow({ rowNumber: 3 }), readyRow({ rowNumber: 4 })],
    });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    // Per-row updates only — excludes the final update, which also sets
    // `status` and would otherwise double-count the last row's numbers.
    const progressUpdates = deps.importRepo.update.mock.calls
      .map((c: any[]) => c[1])
      .filter((data: any) => data.resultsJson && data.status === undefined);
    expect(progressUpdates).toHaveLength(3);
    expect(progressUpdates.map((u: any) => u.successCount)).toEqual([1, 2, 3]);
    expect(progressUpdates.map((u: any) => u.errorCount)).toEqual([0, 0, 0]);
    expect(progressUpdates.every((u: any) => u.totalRows === 3)).toBe(true);
  });

  it('resumes from a prior partial attempt without re-committing an already-recorded row', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord({
      status: 'PROCESSING',
      resultsJson: [{ rowNumber: 2, status: 'created', appointmentId: 'apt-from-earlier-attempt' }],
    }));
    deps.resolver.resolve.mockResolvedValue({ rows: [readyRow({ rowNumber: 2 }), readyRow({ rowNumber: 3 })] });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    // Only row 3 should hit CreateAppointmentUseCase; row 2's prior result is carried forward.
    expect(deps.createAppointmentUseCase.execute).toHaveBeenCalledTimes(1);
    expect(deps.createAppointmentUseCase.execute.mock.calls[0]![0].idempotencyKey).toBe('import:import-1:row:3');
    const finalUpdate = deps.importRepo.update.mock.calls.find((c: unknown[]) => (c[1] as any)?.status === 'COMPLETED');
    expect(finalUpdate![1].successCount).toBe(2);
    expect(finalUpdate![1].resultsJson).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, appointmentId: 'apt-from-earlier-attempt' }),
    ]));
  });

  it('emits a batch-level audit log with row counts', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({ rows: [readyRow()] });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    expect(deps.auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.imported.batch',
      entityType: 'AppointmentImport',
      entityId: 'import-1',
      tenantId: 'tenant-1',
    }));
  });

  it('sets final status to FAILED when zero rows succeed', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({ rows: [readyRow({ importable: false, issues: [{ field: 'x', code: 'X', severity: 'error', message: 'bad' }] })] });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });

    const finalUpdate = deps.importRepo.update.mock.calls.find((c: unknown[]) => (c[1] as any)?.status === 'FAILED' || (c[1] as any)?.status === 'COMPLETED');
    expect(finalUpdate![1].status).toBe('FAILED');
  });

  it('passes customFields through to CreateAppointmentUseCase when present', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    deps.resolver.resolve.mockResolvedValue({ rows: [readyRow({ customFields: [{ label: 'Alarm Code', value: '1234' }] })] });
    const worker = buildWorker(deps);

    await worker.execute({ importId: 'import-1', actor: ACTOR });
    expect(deps.createAppointmentUseCase.execute.mock.calls[0]![0].customFields).toEqual([{ label: 'Alarm Code', value: '1234' }]);
  });
});
