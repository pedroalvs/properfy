import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/export-appointments.use-case';
import type { IAppointmentRepository, AppointmentListItem } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IXlsxGenerator, ReportColumn } from '../../../src/modules/report/domain/xlsx-generator';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';

function makeAppointmentListItem(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
  itemOverrides: Partial<AppointmentListItem> = {},
): AppointmentListItem {
  return {
    appointment: new AppointmentEntity({
      id: 'appt-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      propertyId: 'property-1',
      serviceTypeId: 'svc-type-1',
      inspectorId: null,
      status: 'CANCELLED',
      scheduledDate: new Date('2026-04-01T00:00:00.000Z'),
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      keyRequired: true,
      meetingLocation: null,
      keyLocation: null,
      rentalTenantConfirmationStatus: 'PENDING',
      priceAmount: 150,
      payoutAmount: 80,
      pricingRuleSnapshotJson: {},
      notes: null,
      customFieldsJson: null,
      reason: 'Tenant moved out early',
      cancellationReasonCode: 'CLIENT_REQUEST',
      rejectionReasonCode: null,
      appointmentNumber: 42,
      createdByUserId: 'user-1',
      doneMarkedByUserId: null,
      doneCheckedByUserId: null,
      doneCheckedAt: null,
      serviceGroupId: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    }),
    contact: null,
    propertyCode: 'ACME-PROP-0007',
    propertyAddress: '123 Test St, Bondi NSW 2026',
    propertySuburb: 'Bondi',
    propertyLatitude: null,
    propertyLongitude: null,
    tenantName: 'Test Agency',
    tenantAppointmentCodePrefix: 'INS',
    branchName: 'Main Branch',
    serviceTypeName: 'Routine Inspection',
    inspectorName: 'Jane Inspector',
    serviceGroupNumber: null,
    ...itemOverrides,
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('ExportAppointmentsUseCase', () => {
  let appointmentRepo: Pick<IAppointmentRepository, 'findAll' | 'count'>;
  let xlsxGenerator: IXlsxGenerator;
  let useCase: ExportAppointmentsUseCase;
  let generatedColumns: ReportColumn[];
  let generatedRows: Record<string, unknown>[];

  beforeEach(() => {
    generatedColumns = [];
    generatedRows = [];
    appointmentRepo = {
      findAll: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    };
    xlsxGenerator = {
      generate: vi.fn(async (columns: ReportColumn[], rows: Record<string, unknown>[]) => {
        generatedColumns = columns;
        generatedRows = rows;
        return Buffer.from('fake-xlsx');
      }),
    };
    const authorizationService = new AuthorizationService({ log: vi.fn() } as any);
    useCase = new ExportAppointmentsUseCase(
      appointmentRepo as IAppointmentRepository,
      xlsxGenerator,
      authorizationService,
    );
  });

  it('returns a base64 xlsx payload', async () => {
    vi.mocked(appointmentRepo.count).mockResolvedValue(1);
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);

    const result = await useCase.execute({ filters: {}, actor: makeActor() });

    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(result.filename).toMatch(/^appointments.*\.xlsx$/);
    expect(Buffer.from(result.contentBase64, 'base64').toString()).toBe('fake-xlsx');
  });

  it('maps the appointment onto the export columns', async () => {
    vi.mocked(appointmentRepo.count).mockResolvedValue(1);
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);

    await useCase.execute({ filters: {}, actor: makeActor() });

    expect(generatedRows).toHaveLength(1);
    expect(generatedRows[0]).toMatchObject({
      code: 'INS-0042',
      agency: 'Test Agency',
      branch: 'Main Branch',
      serviceType: 'Routine Inspection',
      propertyCode: 'ACME-PROP-0007',
      suburb: 'Bondi',
      status: 'CANCELLED',
      inspector: 'Jane Inspector',
      scheduledDate: '01/04/2026',
      timeSlot: '09:00 - 10:00',
      cancellationReason: 'Client Request',
      reason: 'Tenant moved out early',
    });
    // Every column key must resolve to a row key, or the sheet ships blank cells.
    const rowKeys = Object.keys(generatedRows[0]!);
    for (const column of generatedColumns) {
      expect(rowKeys).toContain(column.key);
    }
  });

  it('reports the rejection reason for a REJECTED appointment', async () => {
    vi.mocked(appointmentRepo.count).mockResolvedValue(1);
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([
      makeAppointmentListItem({
        status: 'REJECTED',
        cancellationReasonCode: null,
        rejectionReasonCode: 'TENANT_DECLINED',
      }),
    ]);

    await useCase.execute({ filters: {}, actor: makeActor() });

    expect(generatedRows[0]).toMatchObject({ cancellationReason: 'Tenant Declined' });
  });

  it('leaves the reason blank for a non-terminal appointment', async () => {
    vi.mocked(appointmentRepo.count).mockResolvedValue(1);
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([
      makeAppointmentListItem({
        status: 'SCHEDULED',
        reason: null,
        cancellationReasonCode: null,
        rejectionReasonCode: null,
      }),
    ]);

    await useCase.execute({ filters: {}, actor: makeActor() });

    expect(generatedRows[0]).toMatchObject({ cancellationReason: '' });
  });

  it('passes the list filters straight through to the repository', async () => {
    vi.mocked(appointmentRepo.count).mockResolvedValue(1);
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);

    await useCase.execute({
      filters: { suburb: 'Bondi', confirmationStatus: 'sent', status: ['DONE'] },
      actor: makeActor(),
    });

    expect(appointmentRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ suburb: 'Bondi', confirmationStatus: 'sent', status: ['DONE'] }),
      expect.anything(),
    );
  });

  it('never sends a sortBy — the table sorts client-side', async () => {
    vi.mocked(appointmentRepo.count).mockResolvedValue(1);
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);

    await useCase.execute({ filters: {}, actor: makeActor() });

    const pagination = vi.mocked(appointmentRepo.findAll).mock.calls[0]![1];
    expect(pagination.sortBy).toBeUndefined();
  });

  it('rejects a result set larger than the export cap instead of truncating', async () => {
    vi.mocked(appointmentRepo.count).mockResolvedValue(5001);

    await expect(useCase.execute({ filters: {}, actor: makeActor() })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(appointmentRepo.findAll).not.toHaveBeenCalled();
  });

  it('produces an empty sheet rather than querying when nothing matches', async () => {
    vi.mocked(appointmentRepo.count).mockResolvedValue(0);

    const result = await useCase.execute({ filters: {}, actor: makeActor() });

    expect(appointmentRepo.findAll).not.toHaveBeenCalled();
    expect(generatedRows).toEqual([]);
    expect(result.contentBase64.length).toBeGreaterThan(0);
  });

  it('lets OP narrow to a tenant via the query param', async () => {
    vi.mocked(appointmentRepo.count).mockResolvedValue(0);

    await useCase.execute({ filters: { tenantId: 'tenant-9' }, actor: makeActor({ role: 'OP' }) });

    expect(appointmentRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-9' }),
    );
  });

  // Cross-tenant denial: a crafted tenantId must never widen a tenant-scoped role.
  it('pins CL_ADMIN to its own tenant and ignores a foreign tenantId', async () => {
    vi.mocked(appointmentRepo.count).mockResolvedValue(0);

    await useCase.execute({
      filters: { tenantId: 'other-tenant' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(appointmentRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });

  // Fail closed: an undefined tenant means "no predicate" in buildWhere, so a
  // pinned actor without a tenant would export every agency's appointments.
  it('refuses a tenant-pinned actor carrying no tenant instead of exporting unscoped', async () => {
    await expect(
      useCase.execute({ filters: {}, actor: makeActor({ role: 'CL_ADMIN', tenantId: null }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(appointmentRepo.count).not.toHaveBeenCalled();
    expect(xlsxGenerator.generate).not.toHaveBeenCalled();
  });

  it('rejects INSP', async () => {
    await expect(
      useCase.execute({ filters: {}, actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(appointmentRepo.count).not.toHaveBeenCalled();
  });
});
