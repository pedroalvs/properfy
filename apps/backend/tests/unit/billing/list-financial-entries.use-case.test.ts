import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListFinancialEntriesUseCase } from '../../../src/modules/billing/application/use-cases/list-financial-entries.use-case';
import type { IFinancialEntryRepository } from '../../../src/modules/billing/domain/financial-entry.repository';
import { FinancialEntryEntity, type FinancialEntryProps } from '../../../src/modules/billing/domain/financial-entry.entity';
import type { AuthContext } from '@properfy/shared';

function makeEntry(overrides: Partial<FinancialEntryProps> = {}): FinancialEntryEntity {
  const now = new Date('2026-03-15T10:00:00.000Z');
  const defaults: FinancialEntryProps = {
    id: 'entry-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    entryType: 'TENANT_DEBIT',
    amount: 200,
    currency: 'BRL',
    status: 'PENDING',
    description: 'Tenant debit for routine inspection',
    effectiveAt: now,
    initiatedByUserId: 'user-1',
    approvedByUserId: null,
    approvedAt: null,
    referenceEntryId: null,
    reason: null,
    createdAt: now,
    updatedAt: now,
  };
  return new FinancialEntryEntity({ ...defaults, ...overrides });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    ...overrides,
  };
}

function makeSut() {
  const entryRepo: IFinancialEntryRepository = {
    findById: vi.fn(),
    findByAppointmentAndType: vi.fn(),
    findByReferenceEntryIdAndType: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    updateStatus: vi.fn(),
    sumApprovedPayoutsForInspectorInPeriod: vi.fn(),
  };
  const useCase = new ListFinancialEntriesUseCase(entryRepo);
  return { entryRepo, useCase };
}

const defaultInput = {
  page: 1,
  pageSize: 10,
  sortBy: 'createdAt',
  sortOrder: 'desc' as const,
};

describe('ListFinancialEntriesUseCase', () => {
  let entryRepo: IFinancialEntryRepository;
  let useCase: ListFinancialEntriesUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    entryRepo = sut.entryRepo;
    useCase = sut.useCase;
  });

  it('should allow AM to see all entries without forced filters', async () => {
    const entries = [makeEntry(), makeEntry({ id: 'entry-2' })];
    vi.mocked(entryRepo.findAll).mockResolvedValue(entries);
    vi.mocked(entryRepo.count).mockResolvedValue(2);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(entryRepo.findAll).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  it('should allow AM to filter by tenantId', async () => {
    vi.mocked(entryRepo.findAll).mockResolvedValue([makeEntry()]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    await useCase.execute({
      ...defaultInput,
      tenantId: 'tenant-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(entryRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
  });

  it('should force tenantId to actor.tenantId for CL_ADMIN', async () => {
    vi.mocked(entryRepo.findAll).mockResolvedValue([makeEntry()]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    await useCase.execute({
      ...defaultInput,
      tenantId: 'tenant-other', // Should be ignored
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(entryRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
  });

  it('should force tenantId to actor.tenantId for CL_USER', async () => {
    vi.mocked(entryRepo.findAll).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-2' }),
    });

    expect(entryRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-2' }),
      expect.any(Object),
    );
  });

  it('should force inspectorId and entryType for INSP role', async () => {
    const payoutEntry = makeEntry({
      entryType: 'INSPECTOR_PAYOUT',
      inspectorId: 'insp-user-1',
    });
    vi.mocked(entryRepo.findAll).mockResolvedValue([payoutEntry]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    await useCase.execute({
      ...defaultInput,
      inspectorId: 'some-other-inspector', // Should be ignored
      type: 'TENANT_DEBIT', // Should be ignored
      actor: makeActor({ role: 'INSP', userId: 'insp-user-1' }),
    });

    expect(entryRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectorId: 'insp-user-1',
        entryType: 'INSPECTOR_PAYOUT',
      }),
      expect.any(Object),
    );
  });

  it('should return paginated result with total', async () => {
    vi.mocked(entryRepo.findAll).mockResolvedValue([makeEntry()]);
    vi.mocked(entryRepo.count).mockResolvedValue(25);

    const result = await useCase.execute({
      page: 3,
      pageSize: 5,
      sortBy: 'effectiveAt',
      sortOrder: 'asc',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.total).toBe(25);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(5);
    expect(entryRepo.findAll).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ page: 3, pageSize: 5, sortBy: 'effectiveAt', sortOrder: 'asc' }),
    );
  });

  it('should return empty data array when no entries found', async () => {
    vi.mocked(entryRepo.findAll).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should format amount as string in output', async () => {
    vi.mocked(entryRepo.findAll).mockResolvedValue([makeEntry({ amount: 199.5 })]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data[0].amount).toBe('199.5');
    expect(typeof result.data[0].amount).toBe('string');
  });

  it('should format dates as ISO strings in output', async () => {
    const effectiveAt = new Date('2026-03-15T10:00:00.000Z');
    const approvedAt = new Date('2026-03-15T12:00:00.000Z');
    const createdAt = new Date('2026-03-15T09:00:00.000Z');

    vi.mocked(entryRepo.findAll).mockResolvedValue([
      makeEntry({ effectiveAt, approvedAt, approvedByUserId: 'approver-1', createdAt }),
    ]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data[0].effectiveAt).toBe('2026-03-15T10:00:00.000Z');
    expect(result.data[0].approvedAt).toBe('2026-03-15T12:00:00.000Z');
    expect(result.data[0].createdAt).toBe('2026-03-15T09:00:00.000Z');
  });

  it('should pass date filters to repository', async () => {
    vi.mocked(entryRepo.findAll).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
      actor: makeActor({ role: 'AM' }),
    });

    expect(entryRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ fromDate: '2026-03-01', toDate: '2026-03-31' }),
      expect.any(Object),
    );
  });

  it('should allow OP to filter by any tenantId', async () => {
    vi.mocked(entryRepo.findAll).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      tenantId: 'tenant-5',
      actor: makeActor({ role: 'OP' }),
    });

    expect(entryRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-5' }),
      expect.any(Object),
    );
  });
});
