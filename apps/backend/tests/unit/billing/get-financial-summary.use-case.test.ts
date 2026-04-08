import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetFinancialSummaryUseCase } from '../../../src/modules/billing/application/use-cases/get-financial-summary.use-case';
import type { IFinancialEntryRepository } from '../../../src/modules/billing/domain/financial-entry.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';

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

function makeTenant() {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Tenant 1',
    legalName: 'Tenant 1 Pty Ltd',
    timezone: 'Australia/Sydney',
    currency: 'USD',
    settingsJson: {},
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('GetFinancialSummaryUseCase', () => {
  let entryRepo: IFinancialEntryRepository;
  let tenantRepo: ITenantRepository;
  let useCase: GetFinancialSummaryUseCase;

  beforeEach(() => {
    entryRepo = {
      findById: vi.fn(),
      findByIdEnriched: vi.fn(),
      findAllEnriched: vi.fn(),
      getSummary: vi.fn(),
      findByAppointmentAndType: vi.fn(),
      findByReferenceEntryIdAndType: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      transitionStatus: vi.fn(),
      sumApprovedPayoutsForInspectorInPeriod: vi.fn(),
    };
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new GetFinancialSummaryUseCase(entryRepo, tenantRepo);
  });

  it('returns tenant currency together with totals when tenant scope is resolved', async () => {
    vi.mocked(entryRepo.getSummary).mockResolvedValue({
      totalDebits: 5000,
      totalPayouts: 3000,
      totalAdjustments: 200,
      totalRefunds: 150,
      pendingCount: 7,
      currency: null,
    });
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      actor: makeActor(),
    });

    expect(result).toEqual({
      totalDebits: 5000,
      totalPayouts: 3000,
      totalAdjustments: 200,
      totalRefunds: 150,
      pendingCount: 7,
      currency: 'USD',
    });
  });

  it('keeps currency null when no tenant scope is resolved', async () => {
    vi.mocked(entryRepo.getSummary).mockResolvedValue({
      totalDebits: 0,
      totalPayouts: 0,
      totalAdjustments: 0,
      totalRefunds: 0,
      pendingCount: 0,
      currency: null,
    });

    const result = await useCase.execute({
      actor: makeActor(),
    });

    expect(result.currency).toBeNull();
    expect(tenantRepo.findById).not.toHaveBeenCalled();
  });

  it('passes effectiveFrom and effectiveTo date range to repository', async () => {
    vi.mocked(entryRepo.getSummary).mockResolvedValue({
      totalDebits: 1000,
      totalPayouts: 500,
      totalAdjustments: 0,
      totalRefunds: 0,
      pendingCount: 2,
      currency: null,
    });
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      effectiveFrom: '2026-03-01',
      effectiveTo: '2026-03-31',
      actor: makeActor(),
    });

    expect(entryRepo.getSummary).toHaveBeenCalledWith('tenant-1', {
      effectiveFrom: '2026-03-01',
      effectiveTo: '2026-03-31',
    });
    expect(result.totalDebits).toBe(1000);
    expect(result.currency).toBe('USD');
  });

  it('passes only effectiveFrom when effectiveTo is omitted', async () => {
    vi.mocked(entryRepo.getSummary).mockResolvedValue({
      totalDebits: 200,
      totalPayouts: 100,
      totalAdjustments: 0,
      totalRefunds: 0,
      pendingCount: 1,
      currency: null,
    });

    const result = await useCase.execute({
      effectiveFrom: '2026-04-01',
      actor: makeActor(),
    });

    expect(entryRepo.getSummary).toHaveBeenCalledWith(undefined, {
      effectiveFrom: '2026-04-01',
      effectiveTo: undefined,
    });
    expect(result.totalDebits).toBe(200);
  });

  it('does not pass date range when neither effectiveFrom nor effectiveTo is provided', async () => {
    vi.mocked(entryRepo.getSummary).mockResolvedValue({
      totalDebits: 0,
      totalPayouts: 0,
      totalAdjustments: 0,
      totalRefunds: 0,
      pendingCount: 0,
      currency: null,
    });

    await useCase.execute({
      actor: makeActor(),
    });

    expect(entryRepo.getSummary).toHaveBeenCalledWith(undefined, undefined);
  });
});
