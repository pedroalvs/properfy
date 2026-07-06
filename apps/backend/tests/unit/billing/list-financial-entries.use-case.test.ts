import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListFinancialEntriesUseCase } from '../../../src/modules/billing/application/use-cases/list-financial-entries.use-case';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { IFinancialEntryRepository } from '../../../src/modules/billing/domain/financial-entry.repository';
import { FinancialEntryEntity, type FinancialEntryProps } from '../../../src/modules/billing/domain/financial-entry.entity';
import type { AuthContext } from '@properfy/shared';
import type { FinancialEntryEnriched } from '../../../src/modules/billing/domain/financial-entry.repository';

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
    inspectorId: null,
    ...overrides,
  };
}

function makeEnriched(overrides: Partial<FinancialEntryProps> = {}): FinancialEntryEnriched {
  return {
    entity: makeEntry(overrides),
    appointmentCode: 'VIST-001',
    relatedEntityName: 'Properfy Realty',
    approvedByName: null,
  };
}

function makeSut() {
  const entryRepo: IFinancialEntryRepository = {
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
  const auditService = { log: vi.fn() };
  const useCase = new ListFinancialEntriesUseCase(entryRepo, auditService as any);
  return { entryRepo, auditService, useCase };
}

const defaultInput = {
  page: 1,
  pageSize: 10,
  sortBy: 'createdAt',
  sortOrder: 'desc' as const,
};

describe('ListFinancialEntriesUseCase', () => {
  let entryRepo: IFinancialEntryRepository;
  let auditService: { log: ReturnType<typeof vi.fn> };
  let useCase: ListFinancialEntriesUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    entryRepo = sut.entryRepo;
    auditService = sut.auditService;
    useCase = sut.useCase;
  });

  it('should allow AM to see all entries without forced filters', async () => {
    const entries = [makeEnriched(), makeEnriched({ id: 'entry-2' })];
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue(entries);
    vi.mocked(entryRepo.count).mockResolvedValue(2);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(entryRepo.findAllEnriched).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  it('should allow AM to filter by tenantId', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([makeEnriched()]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    await useCase.execute({
      ...defaultInput,
      tenantId: 'tenant-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(entryRepo.findAllEnriched).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
  });

  it('should force tenantId to actor.tenantId for CL_ADMIN', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([makeEnriched()]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    await useCase.execute({
      ...defaultInput,
      tenantId: 'tenant-other', // Should be ignored
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(entryRepo.findAllEnriched).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
  });

  // 031: CL_USER agency read is allowed here (own-tenant, agency-scoped); the
  // `view_financials` flag is enforced at the route layer, not the use case.
  it('should scope CL_USER to own tenant and agency-visible entry types', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([makeEnriched()]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    await useCase.execute({
      ...defaultInput,
      tenantId: 'tenant-other', // ignored
      actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
    });

    expect(entryRepo.findAllEnriched).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        entryTypeIn: ['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT'],
      }),
      expect.any(Object),
    );
  });

  it.each(['CL_ADMIN', 'CL_USER'] as const)(
    'should fail closed for %s without a tenant scope (no unscoped read)',
    async (role) => {
      await expect(
        useCase.execute({ ...defaultInput, actor: makeActor({ role, tenantId: null }) }),
      ).rejects.toThrow(ForbiddenError);
      expect(entryRepo.findAllEnriched).not.toHaveBeenCalled();
    },
  );

  it('should exclude INSPECTOR_PAYOUT from CL_ADMIN reads by default', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    const [filtersArg] = vi.mocked(entryRepo.findAllEnriched).mock.calls[0];
    expect(filtersArg.entryTypeIn).toEqual(['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT']);
    expect(filtersArg.entryTypeIn).not.toContain('INSPECTOR_PAYOUT');
  });

  it('should forbid a CL role requesting INSPECTOR_PAYOUT explicitly', async () => {
    await expect(
      useCase.execute({
        ...defaultInput,
        type: 'INSPECTOR_PAYOUT',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(entryRepo.findAllEnriched).not.toHaveBeenCalled();
  });

  it('should honor an agency-visible type filter for a CL role (no entryTypeIn)', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      type: 'TENANT_DEBIT',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    const [filtersArg] = vi.mocked(entryRepo.findAllEnriched).mock.calls[0];
    expect(filtersArg.entryType).toBe('TENANT_DEBIT');
    expect(filtersArg.entryTypeIn).toBeUndefined();
  });

  it('should force inspectorId and entryType for INSP role', async () => {
    const payoutEntry = makeEnriched({
      entryType: 'INSPECTOR_PAYOUT',
      inspectorId: 'insp-user-1',
    });
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([payoutEntry]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    await useCase.execute({
      ...defaultInput,
      inspectorId: 'some-other-inspector', // Should be ignored
      type: 'TENANT_DEBIT', // Should be ignored
      actor: makeActor({ role: 'INSP', userId: 'insp-user-1', inspectorId: 'insp-user-1' }),
    });

    expect(entryRepo.findAllEnriched).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectorId: 'insp-user-1',
        entryType: 'INSPECTOR_PAYOUT',
      }),
      expect.any(Object),
    );
  });

  it('should return paginated result with total', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([makeEnriched()]);
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
    expect(entryRepo.findAllEnriched).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ page: 3, pageSize: 5, sortBy: 'effectiveAt', sortOrder: 'asc' }),
    );
  });

  it('should return empty data array when no entries found', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should format amount as string in output', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([makeEnriched({ amount: 199.5 })]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data[0].amount).toBe(199.5);
    expect(typeof result.data[0].amount).toBe('number');
  });

  it('should format dates as ISO strings in output', async () => {
    const effectiveAt = new Date('2026-03-15T10:00:00.000Z');
    const approvedAt = new Date('2026-03-15T12:00:00.000Z');
    const createdAt = new Date('2026-03-15T09:00:00.000Z');

    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([
      makeEnriched({ status: 'APPROVED', effectiveAt, approvedAt, approvedByUserId: 'approver-1', createdAt }),
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

  it('should mask approval metadata for pending entries', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([
      {
        ...makeEnriched({
          status: 'PENDING',
          approvedAt: new Date('2026-03-15T12:00:00.000Z'),
          approvedByUserId: 'approver-1',
        }),
        approvedByName: 'Approver Name',
      },
    ]);
    vi.mocked(entryRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data[0].status).toBe('PENDING');
    expect(result.data[0].approvedByUserId).toBeNull();
    expect(result.data[0].approvedAt).toBeNull();
    expect(result.data[0].approvedByName).toBeNull();
  });

  it('should pass date filters to repository', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
      actor: makeActor({ role: 'AM' }),
    });

    expect(entryRepo.findAllEnriched).toHaveBeenCalledWith(
      expect.objectContaining({ fromDate: '2026-03-01', toDate: '2026-03-31' }),
      expect.any(Object),
    );
  });

  it('should force OP to their own tenantId (CORRECTION-001 close-it)', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    // Sprint 1 W-4-IMPL: OP is tenant-scoped; any tenantId from the filter
    // is ignored and replaced with the actor's tenantId from the JWT.
    await useCase.execute({
      ...defaultInput,
      tenantId: 'tenant-5', // attempted cross-tenant filter — must be ignored
      actor: makeActor({ role: 'OP', tenantId: 'op-tenant' }),
    });

    expect(entryRepo.findAllEnriched).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'op-tenant' }),
      expect.any(Object),
    );
  });

  it('should audit log when AM accesses cross-tenant financial data', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      tenantId: 'tenant-other',
      actor: makeActor({ role: 'AM', tenantId: null, userId: 'am-1' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'financial_entry.cross_tenant_list',
        actorType: 'USER',
        actorId: 'am-1',
        entityType: 'FinancialEntry',
        tenantId: 'tenant-other',
        metadata: expect.objectContaining({
          actorRole: 'AM',
          targetTenantId: 'tenant-other',
        }),
      }),
    );
  });

  it('should not produce a cross-tenant audit log for OP (CORRECTION-001 close-it)', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    // Sprint 1 W-4-IMPL: OP can no longer list cross-tenant financial data,
    // so the cross_tenant_list audit branch never fires for OP.
    await useCase.execute({
      ...defaultInput,
      tenantId: 'tenant-5', // ignored — OP is forced to their own tenant
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1', userId: 'op-1' }),
    });

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should pass appointmentId filter through for AM', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      appointmentId: 'appt-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(entryRepo.findAllEnriched).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'appt-1' }),
      expect.any(Object),
    );
  });

  it('should combine appointmentId with the tenant scope for CL_ADMIN (no bypass)', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      appointmentId: 'appt-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(entryRepo.findAllEnriched).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: 'appt-1',
        tenantId: 'tenant-1',
        entryTypeIn: ['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT'],
      }),
      expect.any(Object),
    );
  });

  it('should not audit log when AM lists without tenant filter', async () => {
    vi.mocked(entryRepo.findAllEnriched).mockResolvedValue([]);
    vi.mocked(entryRepo.count).mockResolvedValue(0);

    await useCase.execute({
      ...defaultInput,
      actor: makeActor({ role: 'AM' }),
    });

    expect(auditService.log).not.toHaveBeenCalled();
  });
});
