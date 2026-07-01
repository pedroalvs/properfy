import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportAgencyFinancialUseCase } from '../../../src/modules/billing/application/use-cases/export-agency-financial.use-case';
import { ValidationError } from '../../../src/shared/domain/errors';
import type { IFinancialEntryRepository, FinancialEntryEnriched } from '../../../src/modules/billing/domain/financial-entry.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import { FinancialEntryEntity, type FinancialEntryProps } from '../../../src/modules/billing/domain/financial-entry.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import type { AuthContext } from '@properfy/shared';

function makeEnriched(overrides: Partial<FinancialEntryProps> = {}): FinancialEntryEnriched {
  const now = new Date('2026-05-10T10:00:00.000Z');
  return {
    entity: new FinancialEntryEntity({
      id: 'e1', tenantId: 'tenant-1', appointmentId: 'a1', inspectorId: null,
      entryType: 'TENANT_DEBIT', amount: 250, currency: 'AUD', status: 'APPROVED',
      description: 'Inspection service debit', effectiveAt: now, initiatedByUserId: 'u1',
      approvedByUserId: 'u2', approvedAt: now, referenceEntryId: null, reason: null,
      createdAt: now, updatedAt: now, ...overrides,
    }),
    appointmentCode: 'PROP-001',
    relatedEntityName: 'Acme Realty',
    approvedByName: 'Op One',
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'u1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null, ...overrides };
}

function makeTenant() {
  return new TenantEntity({
    id: 'tenant-1', name: 'Acme', legalName: 'Acme Pty', timezone: 'Australia/Sydney',
    currency: 'AUD', settingsJson: {}, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  });
}

function makeSut() {
  const entryRepo = {
    findById: vi.fn(), findByIdEnriched: vi.fn(), findAllEnriched: vi.fn(), getSummary: vi.fn(),
    findByAppointmentAndType: vi.fn(), findByReferenceEntryIdAndType: vi.fn(), findAll: vi.fn(),
    count: vi.fn(), save: vi.fn(), updateStatus: vi.fn(), transitionStatus: vi.fn(),
    sumApprovedPayoutsForInspectorInPeriod: vi.fn(),
  } as unknown as IFinancialEntryRepository;
  const tenantRepo = { findById: vi.fn(), findByLegalName: vi.fn(), findAll: vi.fn(), count: vi.fn(), save: vi.fn(), update: vi.fn() } as unknown as ITenantRepository;
  const xlsxGenerator = { generate: vi.fn().mockResolvedValue(Buffer.from('XLSXDATA')) };
  const useCase = new ExportAgencyFinancialUseCase(entryRepo, tenantRepo, xlsxGenerator);
  return { entryRepo, tenantRepo, xlsxGenerator, useCase };
}

describe('ExportAgencyFinancialUseCase', () => {
  let sut: ReturnType<typeof makeSut>;
  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
    vi.mocked(sut.tenantRepo.findById).mockResolvedValue(makeTenant());
  });

  it('scopes a CL actor to their own tenant and agency entry types', async () => {
    vi.mocked(sut.entryRepo.count).mockResolvedValue(1);
    vi.mocked(sut.entryRepo.findAllEnriched).mockResolvedValue([makeEnriched()]);

    await sut.useCase.execute({ tenantId: 'tenant-other', actor: makeActor({ tenantId: 'tenant-1' }) });

    const [filters] = vi.mocked(sut.entryRepo.findAllEnriched).mock.calls[0];
    expect(filters.tenantId).toBe('tenant-1');
    expect(filters.entryTypeIn).toEqual(['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT']);
  });

  it('builds rows from entries and returns a base64 XLSX payload', async () => {
    vi.mocked(sut.entryRepo.count).mockResolvedValue(1);
    vi.mocked(sut.entryRepo.findAllEnriched).mockResolvedValue([makeEnriched()]);

    const result = await sut.useCase.execute({ actor: makeActor(), fromDate: '2026-05-01', toDate: '2026-05-31' });

    const [, rows] = vi.mocked(sut.xlsxGenerator.generate).mock.calls[0];
    expect(rows).toEqual([
      { date: '2026-05-10', type: 'TENANT_DEBIT', property: 'PROP-001', description: 'Inspection service debit', amount: 250, currency: 'AUD', status: 'APPROVED' },
    ]);
    expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.contentBase64).toBe(Buffer.from('XLSXDATA').toString('base64'));
    expect(result.filename).toBe('financial-statement-2026-05-01_2026-05-31.xlsx');
  });

  it('generates an empty sheet (no findAllEnriched) when there are no entries', async () => {
    vi.mocked(sut.entryRepo.count).mockResolvedValue(0);

    await sut.useCase.execute({ actor: makeActor() });

    expect(sut.entryRepo.findAllEnriched).not.toHaveBeenCalled();
    const [, rows] = vi.mocked(sut.xlsxGenerator.generate).mock.calls[0];
    expect(rows).toEqual([]);
  });

  it('throws ValidationError when no tenant scope can be resolved (AM without tenantId)', async () => {
    await expect(
      sut.useCase.execute({ actor: makeActor({ role: 'AM', tenantId: null }) }),
    ).rejects.toThrow(ValidationError);
  });

  it('fails closed for a CL role without a tenant scope (ignores input.tenantId)', async () => {
    const { ForbiddenError } = await import('../../../src/shared/domain/errors');
    await expect(
      sut.useCase.execute({ tenantId: 'tenant-other', actor: makeActor({ role: 'CL_USER', tenantId: null }) }),
    ).rejects.toThrow(ForbiddenError);
    expect(sut.entryRepo.findAllEnriched).not.toHaveBeenCalled();
  });

  it('rejects an over-large export instead of loading an unbounded history', async () => {
    vi.mocked(sut.entryRepo.count).mockResolvedValue(5001);

    await expect(
      sut.useCase.execute({ actor: makeActor() }),
    ).rejects.toThrow(ValidationError);
    expect(sut.entryRepo.findAllEnriched).not.toHaveBeenCalled();
  });
});
