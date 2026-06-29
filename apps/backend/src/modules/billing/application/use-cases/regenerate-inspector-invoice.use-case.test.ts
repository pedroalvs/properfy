import { describe, expect, it, vi } from 'vitest';
import { RegenerateInspectorInvoiceUseCase } from './regenerate-inspector-invoice.use-case';
import { InspectorInvoiceEntity } from '../../domain/inspector-invoice.entity';

const INVOICE_ID = 'invoice-existing-1';
const INSPECTOR_ID = 'insp-1';

const MOCK_ACTOR = { userId: 'user-am-1', role: 'AM' as const, tenantId: null, branchId: null, inspectorId: null };

function makeExistingInvoice(): InspectorInvoiceEntity {
  return new InspectorInvoiceEntity({
    id: INVOICE_ID,
    inspectorId: INSPECTOR_ID,
    inspectorName: 'John Inspector',
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEnd: new Date('2026-01-14T00:00:00.000Z'),
    periodType: 'BIWEEKLY',
    status: 'CLOSED',
    totalAmount: 500,
    currency: 'AUD',
    fileKey: 'files/old-invoice.pdf',
    previousInvoiceId: null,
    generatedByUserId: 'user-op-1',
    generatedAt: new Date('2026-01-15T10:00:00.000Z'),
    paidAt: null,
    paidByUserId: null,
    paymentReference: null,
    notes: null,
    draftedByInspectorId: null,
    createdAt: new Date('2026-01-15T09:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
  });
}

function makeDeps(existing: InspectorInvoiceEntity | null = makeExistingInvoice()) {
  const invoiceRepo = {
    findById: vi.fn().mockResolvedValue(existing),
    update: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  };

  const financialEntryRepo = {
    sumApprovedPayoutsForInspectorInPeriod: vi.fn().mockResolvedValue(750),
  };

  const auditService = { log: vi.fn() };
  const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const authorizationService = { assertRoles: vi.fn() };

  return { invoiceRepo, financialEntryRepo, auditService, jobQueue, authorizationService };
}

describe('RegenerateInspectorInvoiceUseCase — #109 in-place update', () => {
  it('never calls invoiceRepo.save', async () => {
    const deps = makeDeps();
    const useCase = new RegenerateInspectorInvoiceUseCase(
      deps.invoiceRepo as any,
      deps.financialEntryRepo as any,
      deps.auditService as any,
      deps.jobQueue as any,
      deps.authorizationService as any,
    );

    await useCase.execute({ invoiceId: INVOICE_ID, actor: MOCK_ACTOR });

    expect(deps.invoiceRepo.save).not.toHaveBeenCalled();
  });

  it('calls invoiceRepo.update in-place with the original invoiceId and CLOSED status', async () => {
    const deps = makeDeps();
    const useCase = new RegenerateInspectorInvoiceUseCase(
      deps.invoiceRepo as any,
      deps.financialEntryRepo as any,
      deps.auditService as any,
      deps.jobQueue as any,
      deps.authorizationService as any,
    );

    await useCase.execute({ invoiceId: INVOICE_ID, actor: MOCK_ACTOR });

    expect(deps.invoiceRepo.update).toHaveBeenCalledOnce();
    const [calledId, calledData] = deps.invoiceRepo.update.mock.calls[0];
    expect(calledId).toBe(INVOICE_ID);
    expect(calledData).toMatchObject({ status: 'CLOSED', totalAmount: 750 });
  });

  it('returns the same id as the input invoiceId (no new UUID)', async () => {
    const deps = makeDeps();
    const useCase = new RegenerateInspectorInvoiceUseCase(
      deps.invoiceRepo as any,
      deps.financialEntryRepo as any,
      deps.auditService as any,
      deps.jobQueue as any,
      deps.authorizationService as any,
    );

    const result = await useCase.execute({ invoiceId: INVOICE_ID, actor: MOCK_ACTOR });

    expect(result.id).toBe(INVOICE_ID);
  });

  it('returns totalAmount reflecting the recomputed value, not the stale existing amount', async () => {
    const deps = makeDeps();
    const useCase = new RegenerateInspectorInvoiceUseCase(
      deps.invoiceRepo as any,
      deps.financialEntryRepo as any,
      deps.auditService as any,
      deps.jobQueue as any,
      deps.authorizationService as any,
    );

    const result = await useCase.execute({ invoiceId: INVOICE_ID, actor: MOCK_ACTOR });

    // existing.totalAmount is 500, recomputed is 750
    expect(result.totalAmount).toBe(750);
    expect(result.totalAmount).not.toBe(500);
  });
});
